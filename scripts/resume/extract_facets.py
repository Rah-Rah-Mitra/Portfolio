"""Propose grounded facets for résumé bullets with Google's LangExtract.

Usage:
    pip install langextract
    # local, nothing leaves the machine (needs ollama serve + the model pulled):
    python scripts/resume/extract_facets.py --model gemma2:9b --local
    # or Gemini, which needs LANGEXTRACT_API_KEY:
    python scripts/resume/extract_facets.py --model gemini-2.5-flash

This is an AUTHORING AID, not part of any build. Read this before running it:

  * Nothing it writes is served. The output goes to .impeccable/resume-facets/
    (gitignored), for Rahul to read. There is no committed artifact, no runtime
    index and no CI gate, because nothing at serve time consumes facets: the
    checker in server/resumeCheck.mjs derives what it needs deterministically,
    and `npm run resume:lint` needs no model at all. An LLM artifact also cannot
    inherit the server/portfolio-snapshot.json precedent, which is pinned by
    equality because it is a pure function of source.
  * It may only ever annotate bullets that already exist. It must never be used
    to write or reword one. Bullet text is Rahul's, and the whole résumé builder
    is designed around the rule that a model cannot put words in a document.
  * The value it adds over the deterministic checker is the part regex cannot
    reach: what a bullet is actually about, what was built, and what the outcome
    was. Verbs, metrics and repetition are already handled without a model, and
    better, because they are reproducible.

Every extraction is grounded: LangExtract returns a char_interval into the
bullet, and --verify re-slices each one and drops any span that does not match
the text it claims. That check is deterministic even though the extraction is
not, so a hallucinated span cannot survive into the report.
"""
import argparse
import json
import os
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONTENT = Path(__file__).resolve().parent / "content"
OUT = ROOT / ".impeccable" / "resume-facets"
SECTIONS = ("education", "experience", "projects", "leadership")

PROMPT = """Extract factual facets from one bullet of a technical resume.

Use the exact words of the source for every extraction; never paraphrase, never
summarise and never add a fact the text does not state. Extract only what is
written. If a facet is not present, omit it rather than inferring it.

Classes:
  artifact   the thing that was built or operated, as a noun phrase
  technology a named language, framework, service, model, protocol or tool
  outcome    the stated result or purpose, in the source's own words
  scope      stated scale, size, duration, or the population affected
"""


def examples(lx):
    """Few-shot examples, quoted verbatim from scripts/resume/content."""
    return [
        lx.data.ExampleData(
            text=(
                "Provisioned the platform's AWS deployment with Terraform (Fargate services, "
                "Route 53 DNS, Redis caching, and Kafka messaging), applying cloud security "
                "practices across the environment."
            ),
            extractions=[
                lx.data.Extraction(extraction_class="artifact", extraction_text="the platform's AWS deployment"),
                lx.data.Extraction(extraction_class="technology", extraction_text="Terraform"),
                lx.data.Extraction(extraction_class="technology", extraction_text="Fargate"),
                lx.data.Extraction(extraction_class="technology", extraction_text="Route 53"),
                lx.data.Extraction(extraction_class="technology", extraction_text="Redis"),
                lx.data.Extraction(extraction_class="technology", extraction_text="Kafka"),
                lx.data.Extraction(extraction_class="outcome", extraction_text="applying cloud security practices across the environment"),
            ],
        ),
        lx.data.ExampleData(
            text=(
                "Led the funding bid for a community gardening platform covering product, "
                "engineering, and operations; awarded the S$20,000 Sparks Community Innovation "
                "Fund grant."
            ),
            extractions=[
                lx.data.Extraction(extraction_class="artifact", extraction_text="a community gardening platform"),
                lx.data.Extraction(extraction_class="outcome", extraction_text="awarded the S$20,000 Sparks Community Innovation Fund grant"),
                lx.data.Extraction(extraction_class="scope", extraction_text="product, engineering, and operations"),
            ],
        ),
    ]


def bullets():
    """Every selectable bullet text, default variant only, as (ref, text)."""
    rows = []
    for section in SECTIONS:
        with open(CONTENT / f"{section}.json", encoding="utf-8") as handle:
            pool = json.load(handle)
        for entry in pool["entries"]:
            if entry.get("blocked"):
                continue
            for bullet in entry.get("bullets", []):
                rows.append((f"{entry['id']}.{bullet['id']}", bullet["text"]["default"]))
    return rows


def verified(document, source):
    """Keep only extractions whose char_interval really slices back to their text.

    LangExtract aligns each extraction to the source and reports how well it
    matched. Exact and lesser matches are re-sliced here and compared, so a span
    the model invented, or one the aligner placed loosely, is dropped rather
    than trusted. This is the deterministic half of an inherently
    non-deterministic step, and it is why the output is worth reading at all.
    """
    kept, dropped = [], []
    for item in document.extractions or []:
        span = item.char_interval
        if span is None or span.start_pos is None or span.end_pos is None:
            dropped.append({"class": item.extraction_class, "text": item.extraction_text, "why": "no span"})
            continue
        sliced = source[span.start_pos:span.end_pos]
        if sliced.strip().lower() != item.extraction_text.strip().lower():
            dropped.append({"class": item.extraction_class, "text": item.extraction_text, "why": f"span holds {sliced!r}"})
            continue
        kept.append({
            "class": item.extraction_class,
            "text": item.extraction_text,
            "start": span.start_pos,
            "end": span.end_pos,
            "alignment": getattr(item.alignment_status, "value", None),
        })
    return kept, dropped


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="gemini-2.5-flash", help="model id, or an ollama tag with --local")
    parser.add_argument("--local", action="store_true", help="run against a local ollama at --url")
    parser.add_argument("--url", default="http://localhost:11434", help="ollama base url")
    parser.add_argument("--ref", help="one bullet ref, for a quick trial")
    parser.add_argument("--out", default=str(OUT), help="output directory (gitignored by default)")
    args = parser.parse_args()

    try:
        import langextract as lx
    except ImportError:
        raise SystemExit("langextract is not installed. pip install langextract")

    if not args.local and not os.environ.get("LANGEXTRACT_API_KEY"):
        raise SystemExit("set LANGEXTRACT_API_KEY, or pass --local to use ollama")

    rows = [row for row in bullets() if not args.ref or row[0] == args.ref]
    if not rows:
        raise SystemExit(f"no bullet matches {args.ref!r}")

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    results, tally, dropped_total = [], Counter(), 0

    for ref, text in rows:
        options = {"model_id": args.model, "temperature": 0}
        if args.local:
            options.update(model_url=args.url, fence_output=False, use_schema_constraints=False)
        document = lx.extract(text_or_documents=text, prompt_description=PROMPT,
                              examples=examples(lx), **options)
        kept, dropped = verified(document, text)
        dropped_total += len(dropped)
        for item in kept:
            tally[item["class"]] += 1
        results.append({"ref": ref, "text": text, "facets": kept, "rejected": dropped})
        print(f"{ref:32s} {len(kept):2d} kept, {len(dropped):2d} rejected")

    report = {
        "model": args.model,
        "local": args.local,
        "bullets": len(results),
        "kept": dict(sorted(tally.items())),
        "rejected": dropped_total,
        "results": results,
    }
    path = out / "facets.json"
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2, ensure_ascii=False)
    print(f"\n{sum(tally.values())} grounded facets over {len(results)} bullets, "
          f"{dropped_total} rejected for a span that did not match.")
    print(f"Written to {path}. Nothing here is served: read it, and hand-write "
          f"anything worth keeping into the content JSONs yourself.")


if __name__ == "__main__":
    main()
