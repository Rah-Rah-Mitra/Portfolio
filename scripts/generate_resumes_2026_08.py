from __future__ import annotations

from copy import deepcopy
from pathlib import Path

from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn


ROOT = Path(__file__).resolve().parents[1]
GENERATED = ROOT / "public" / "resume" / "generated"
EDITION_FROM = "2026-07"
EDITION_TO = "2026-08"

CONTACT_LINKS = [
    ("Singapore", None),
    ("mitrarahul2002@gmail.com", "mailto:mitrarahul2002@gmail.com"),
    ("linkedin.com/in/rahulmitra-dev", "https://www.linkedin.com/in/rahulmitra-dev"),
    ("github.com/Rah-Rah-Mitra", "https://github.com/Rah-Rah-Mitra"),
    ("rahul-mitra.com", "https://rahul-mitra.com/"),
]

REPLACEMENTS: dict[str, dict[str, str]] = {
    "ai-engineer": {
        "Skills: Python; BERT; DNN; RAG; AI Agents; OpenAI GPT-4; Gemini; Vector Search; SEALION; ASPIRE 2A; LangChain; Computer Vision; Multi-View Geometry; Structure-from-Motion; Model Evaluation.":
        "Skills: Python; BERT; DNN; RAG; AI Agents; GPT-4; Gemini; Vector Search; SEALION; ASPIRE 2A; 3D Computer Vision; Projective & Epipolar Geometry; Absolute Pose; Structure-from-Motion; Bundle Adjustment; Multi-View Stereo; Model Evaluation.",
    },
    "software-engineer": {
        "Skills: Python; TypeScript; React; Next.js; Three.js; FastAPI; Flask; aiohttp; asyncio; Java; Docker; CI/CD; Azure; Singpass/Myinfo; Codex.":
        "Skills: Python; TypeScript; React; Next.js; Three.js; FastAPI; aiohttp/asyncio; Docker; CI/CD; Azure; 3D CV: projective & epipolar geometry, absolute pose, SfM, bundle adjustment, multi-view stereo.",
    },
    "operations-research-engineer": {
        "- Modeled production scheduling as a digital twin simulation and constraint-programming optimization problem, connecting ISE methods with deployment-oriented Python tooling.":
        "- Modeled hybrid flow-shop scheduling as a digital twin with explicit objectives and constraints, using constraint programming, simulation, and deployment-oriented Python tooling.",
        "Skills: Constraint Programming; Scheduling Optimization; Hybrid Flow Shop; Digital Twin Simulation; Dijkstra; SSSP/APSP; Python; Jupyter; Statistics; Simulation; Excel VBA; Decision Analytics.":
        "Skills: Constraint Programming; Hybrid Flow-Shop Scheduling; Digital Twin Simulation; Objective Functions & Constraints; Graph Optimization; Network Flow; Dijkstra; Python; Jupyter; Statistics; Excel VBA; Decision Analytics.",
    },
    "general": {
        "Operations Research / Optimization: Constraint Programming, Scheduling Optimization, Hybrid Flow Shop, Digital Twin Simulation, Simulation, Dijkstra / SSSP / APSP, Decision Analytics, Statistics, Jupyter, Mathematical Modeling (Linear Algebra, Probability, Calculus)":
        "Operations Research / Optimization: Constraint Programming, Hybrid Flow-Shop Scheduling, Digital Twin Simulation, Objective Functions and Constraints, Graph Optimization, Network Flow, Dijkstra / SSSP / APSP, Decision Analytics, Statistics, Jupyter, Mathematical Modeling (Linear Algebra, Probability, Calculus)",
        "AI/ML: BERT, DNN, Transformers, RAG / RAG Architecture, AI Agents, OpenAI GPT-4, Gemini, SEALION, LangChain, Vector Search, Computer Vision, Multi-View Geometry, Structure-from-Motion, Bundle Adjustment, Model Evaluation, NLP, Deep Reinforcement Learning (PPO, A2C, DDPG, DQN, Double DQN), ASPIRE 2A / HPC / CUDA / distributed training":
        "AI/ML: BERT, DNN, Transformers, RAG, AI Agents, GPT-4, Gemini, SEALION, LangChain, Vector Search, 3D Computer Vision, Projective & Epipolar Geometry, Absolute Pose, Structure-from-Motion, Bundle Adjustment, Multi-View Stereo, Model Evaluation, NLP, Deep RL (PPO, A2C, DDPG, DQN), ASPIRE 2A / HPC / CUDA / distributed training",
    },
}


def copy_run_properties(source_run, target_run) -> None:
    if source_run is not None and source_run._r.rPr is not None:
        target_run._r.insert(0, deepcopy(source_run._r.rPr))


def clear_paragraph_content(paragraph) -> None:
    for child in list(paragraph._p):
        if child.tag != qn("w:pPr"):
            paragraph._p.remove(child)


def add_hyperlink(paragraph, label: str, target: str, sample_run) -> None:
    relationship_id = paragraph.part.relate_to(
        target,
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink",
        is_external=True,
    )
    hyperlink = OxmlElement("w:hyperlink")
    hyperlink.set(qn("r:id"), relationship_id)
    hyperlink.set(qn("w:history"), "1")
    run = OxmlElement("w:r")
    properties = deepcopy(sample_run._r.rPr) if sample_run is not None and sample_run._r.rPr is not None else OxmlElement("w:rPr")
    color = properties.find(qn("w:color"))
    if color is None:
        color = OxmlElement("w:color")
        properties.append(color)
    color.set(qn("w:val"), "0B514C")
    underline = properties.find(qn("w:u"))
    if underline is None:
        underline = OxmlElement("w:u")
        properties.append(underline)
    underline.set(qn("w:val"), "single")
    run.append(properties)
    text = OxmlElement("w:t")
    text.text = label
    run.append(text)
    hyperlink.append(run)
    paragraph._p.append(hyperlink)


def replace_contact_line(paragraph) -> None:
    sample_run = paragraph.runs[0] if paragraph.runs else None
    clear_paragraph_content(paragraph)
    for index, (label, target) in enumerate(CONTACT_LINKS):
        if index:
            separator = paragraph.add_run(" | ")
            copy_run_properties(sample_run, separator)
        if target:
            add_hyperlink(paragraph, label, target, sample_run)
        else:
            run = paragraph.add_run(label)
            copy_run_properties(sample_run, run)


def replace_paragraph_text(paragraph, text: str) -> None:
    sample_run = paragraph.runs[0] if paragraph.runs else None
    clear_paragraph_content(paragraph)
    run = paragraph.add_run(text)
    copy_run_properties(sample_run, run)


def iter_paragraphs(document):
    yield from document.paragraphs
    for table in document.tables:
        for row in table.rows:
            for cell in row.cells:
                yield from cell.paragraphs


def generate(slug: str) -> Path:
    source = GENERATED / f"rahul-mitra-{slug}-{EDITION_FROM}.docx"
    target = GENERATED / f"rahul-mitra-{slug}-{EDITION_TO}.docx"
    document = Document(source)
    replacements = REPLACEMENTS.get(slug, {})
    found_contact = False
    found_replacements: set[str] = set()

    for paragraph in iter_paragraphs(document):
        original = paragraph.text.strip()
        if "mitrarahul2002@gmail.com" in original and ("vercel.app" in original or "rahul-mitra.com" in original):
            replace_contact_line(paragraph)
            found_contact = True
            continue
        if original in replacements:
            replace_paragraph_text(paragraph, replacements[original])
            found_replacements.add(original)

    if not found_contact:
        raise RuntimeError(f"Contact line not found in {source.name}")
    missing = set(replacements) - found_replacements
    if missing:
        raise RuntimeError(f"Expected content was not found in {source.name}: {sorted(missing)}")

    document.core_properties.author = "Rahul Mitra"
    document.core_properties.last_modified_by = "Rahul Mitra"
    document.core_properties.subject = f"Rahul Mitra — {slug.replace('-', ' ').title()} résumé"
    document.core_properties.keywords = "Rahul Mitra, résumé, rahul-mitra.com"
    document.save(target)
    return target


def main() -> None:
    sources = sorted(GENERATED.glob(f"rahul-mitra-*-{EDITION_FROM}.docx"))
    if len(sources) != 7:
        raise RuntimeError(f"Expected seven source résumés, found {len(sources)}")
    generated = [generate(source.name.removeprefix("rahul-mitra-").removesuffix(f"-{EDITION_FROM}.docx")) for source in sources]
    for path in generated:
        print(path)


if __name__ == "__main__":
    main()
