import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CERT_GROUPS,
  certifications,
  certificationCounts,
  certificationDateLabel,
  certificationSpan,
  filterCertifications,
  listedCertifications,
  type CertGroup,
} from '../lib/certifications';
import { fieldNotes, unifiedPortfolioData } from '../portfolioData';

const GROUP_IDS = new Set(CERT_GROUPS.map((group) => group.id).filter((id): id is CertGroup => id !== 'ALL'));

describe('certification register', () => {
  // Nothing else in this repo checks that a /public reference resolves, so a 404
  // would otherwise ship silently through npm test, the build and the e2e run.
  it('ships every referenced file', () => {
    for (const certification of certifications) {
      expect(existsSync(join('public', certification.file)), certification.file).toBe(true);
    }
  });

  it('keeps ids, files and extensions in agreement', () => {
    const ids = certifications.map((certification) => certification.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const certification of certifications) {
      expect(certification.file).toBe(`/certificates/courses/${certification.id}.${certification.ext}`);
      expect(['pdf', 'png']).toContain(certification.ext);
      // The no-JS evidence counts in tests/e2e/quality.spec.ts match on these two
      // prefixes, and the experience one is not scoped to a window.
      expect(certification.id.startsWith('experience-')).toBe(false);
      expect(certification.id.startsWith('project-')).toBe(false);
    }
  });

  it('carries a real ISO date and a known group on every record', () => {
    for (const certification of certifications) {
      expect(certification.date, certification.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(certification.date)), certification.id).toBe(false);
      expect(GROUP_IDS.has(certification.group), certification.id).toBe(true);
      expect(certification.title.length).toBeGreaterThan(0);
      expect(certification.issuer.length).toBeGreaterThan(0);
      expect(certification.tags.length).toBeGreaterThan(0);
    }
  });

  it('lists 43 of 48, and every withheld row says why', () => {
    expect(certifications).toHaveLength(48);
    expect(listedCertifications).toHaveLength(43);
    const withheld = certifications.filter((certification) => certification.excluded);
    expect(withheld).toHaveLength(5);
    for (const certification of withheld) {
      expect(certification.excluded?.trim().length, certification.id).toBeGreaterThan(0);
    }
  });

  it('sorts newest first and reports a matching span and counts', () => {
    const dates = certifications.map((certification) => certification.date);
    expect([...dates].sort().reverse()).toEqual(dates);
    expect(certificationSpan).toEqual({ from: '2019', to: '2026' });
    const total = certificationCounts.reduce((sum, group) => sum + group.count, 0);
    expect(total).toBe(listedCertifications.length);
  });

  it('filters by query and by group, and never returns a withheld row', () => {
    expect(filterCertifications('', 'ALL')).toHaveLength(43);
    expect(filterCertifications('docker', 'ALL').map((item) => item.id))
      .toEqual(['packt-docker-for-the-absolute-beginner-hands-on']);
    for (const group of GROUP_IDS) {
      const rows = filterCertifications('', group);
      expect(rows.every((row) => row.group === group), group).toBe(true);
    }
    // The NVIDIA course is withheld because it is already a distinction row.
    expect(filterCertifications('disaster risk', 'ALL')).toHaveLength(0);
    expect(filterCertifications('instagram', 'ALL')).toHaveLength(0);
  });

  it('renders a readable date label', () => {
    const [newest] = certifications;
    expect(certificationDateLabel(newest)).toBe('Jan 2026');
  });
});

describe('certification field notes', () => {
  const notes = fieldNotes.filter((note) => note.certId);

  it('resolves every certId to a real certification', () => {
    expect(notes.length).toBeGreaterThan(0);
    const byId = new Map(certifications.map((certification) => [certification.id, certification]));
    for (const note of notes) {
      expect(byId.has(note.certId ?? ''), `${note.id} -> ${note.certId}`).toBe(true);
    }
  });

  it('takes its dates from the certificate rather than from portfolioData', () => {
    const byId = new Map(certifications.map((certification) => [certification.id, certification]));
    for (const note of notes) {
      const certification = byId.get(note.certId ?? '');
      expect(note.sortDate, note.id).toBe(certification?.date);
      expect(note.dateLabel, note.id).toBe(certificationDateLabel(certification!));
    }
  });
});

describe('proof window', () => {
  it('links the NVIDIA distinction to the certificate the register withholds', () => {
    const achievement = unifiedPortfolioData.achievements.find((item) => item.title.includes('NVIDIA'));
    expect(achievement?.proofUrl).toBe(
      '/certificates/courses/nvidia-dli-disaster-risk-monitoring-using-satellite-imagery.pdf',
    );
    expect(existsSync(join('public', achievement?.proofUrl ?? ''))).toBe(true);
  });
});
