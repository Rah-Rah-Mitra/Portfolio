import type { ProjectMedia } from './types';

export const supportingMedia: Record<string, ProjectMedia> = {
  heroCalibration: {
    id: 'field-calibration-ambient', kind: 'video', posterSrc: '/media/field-calibration-poster.webp',
    webmSrc: '/media/field-calibration.webm', mp4Src: '/media/field-calibration.mp4', durationSeconds: 4.04,
    width: 768, height: 512,
    alt: 'Abstract calibration laboratory with restrained optical movement.',
    transcript: 'A white engineering calibration environment shifts slowly behind graphite camera equipment and sparse tracking signals. The clip is supporting ambience and contains no portfolio evidence.',
    workflowId: 'ltxv-fast-t2v-distilled', provenanceId: 'field-calibration-ambient', loadPriority: 'near-viewport',
    provenance: {
      status: 'selected', promptId: 'legacy-reviewed-generation', seed: 4837376,
      workflowSha256: 'recorded-in-workflows-comfyui-model-manifest',
      outputSha256: {
        webm: 'F371C3B93063AE4179D6A9011F275FF3939278F24FEA83068BC51A20462A4B4A',
        mp4: 'C3BAD55548481A1C865FC4C30589FEA4177495DBB6941B4F23FFB645A5DA3C77',
        poster: 'E457C03C5A4532404C3F4CF0AACE4DECEC801CC0BCED8A788DE70B6EB801BF64',
      },
    },
  },
};
