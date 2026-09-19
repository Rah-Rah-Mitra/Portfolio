// Course certifications - the register rendered inside the Proof Vault window
// (desktop) and behind the CERTS chip in the Field Index (mobile).
//
// Every field is read off the certificate itself, not off the filename or the
// file's timestamp: nine of these were downloaded in the same minute, so mtimes
// say nothing about when a course was completed. Titles likewise come from
// inside the document - the source filenames carry typos (Cartificate,
// Ceritificate, Artifictial, Finanace).
//
// `excluded` withholds a ROW, not a file: every certificate ships under
// public/certificates/courses/ and stays reachable at its own URL. It is
// deliberately NOT named `blocked` - that word is already load-bearing in this
// repo for resume emitters (see CLAUDE.md), and this flag has a different
// contract.
//
// Nothing here reaches server/portfolio-snapshot.json, and so nothing here
// reaches the ATTESTED vocabulary in server/jobSearch.mjs. That is on purpose:
// a certificate is not resume evidence until Rahul says it is.

export type CertGroup =
  | 'AI & ML'
  | 'Systems & Languages'
  | 'Security'
  | 'Data & Analytics'
  | 'Cloud & Web'
  | 'Graphics & Vision';

/** Chip order in the register. Short labels on purpose: `.wb-domainseg` is
 *  inline-flex with no flex-wrap, and the Proof Vault content box is ~800px. */
export const CERT_GROUPS: ReadonlyArray<{ id: CertGroup | 'ALL'; label: string }> = [
  { id: 'ALL', label: 'ALL' },
  { id: 'AI & ML', label: 'AI/ML' },
  { id: 'Systems & Languages', label: 'SYSTEMS' },
  { id: 'Security', label: 'SECURITY' },
  { id: 'Data & Analytics', label: 'DATA' },
  { id: 'Cloud & Web', label: 'CLOUD' },
  { id: 'Graphics & Vision', label: 'VISION' },
];

export interface Certification {
  /** Kebab slug; always equal to the stem of `file`. */
  id: string;
  /** Canonical course title, as printed on the certificate. */
  title: string;
  issuer: string;
  /** ISO YYYY-MM-DD, as printed on the certificate. */
  date: string;
  group: CertGroup;
  credentialId?: string;
  file: string;
  ext: 'pdf' | 'png';
  tags: string[];
  /** Set when the row is withheld from the register. The file still ships. */
  excluded?: string;
}

/** All 48, newest first. */
export const certifications: Certification[] = [
  {
    id: 'linkedin-learning-reality-capture-foundations-for-aec',
    title: 'Reality Capture Foundations for AEC',
    issuer: 'LinkedIn Learning',
    date: '2026-01-15',
    group: 'Graphics & Vision',
    credentialId: 'cc6b2a58f46e2c962a099b0227a8b1d48949d1f99e7e56d8388e7f89e8d6e400',
    file: '/certificates/courses/linkedin-learning-reality-capture-foundations-for-aec.pdf',
    ext: 'pdf',
    tags: ['3D Scanning', 'Photogrammetry'],
  },
  {
    id: 'career-academy-owasp-forgery-and-phishing',
    title: 'OWASP: Forgery and Phishing',
    issuer: 'Career Academy',
    date: '2025-05-19',
    group: 'Security',
    credentialId: '167849734',
    file: '/certificates/courses/career-academy-owasp-forgery-and-phishing.pdf',
    ext: 'pdf',
    tags: ['OWASP', 'Web Security', 'Phishing'],
  },
  {
    id: 'packt-privilege-escalation-techniques',
    title: 'Privilege Escalation Techniques',
    issuer: 'Packt',
    date: '2025-05-05',
    group: 'Security',
    credentialId: '166324606',
    file: '/certificates/courses/packt-privilege-escalation-techniques.pdf',
    ext: 'pdf',
    tags: ['Privilege Escalation'],
  },
  {
    id: 'packt-machine-learning-for-finance',
    title: 'Machine Learning for Finance',
    issuer: 'Packt',
    date: '2024-10-01',
    group: 'AI & ML',
    credentialId: '143583686',
    file: '/certificates/courses/packt-machine-learning-for-finance.pdf',
    ext: 'pdf',
    tags: ['Machine Learning', 'Finance'],
  },
  {
    id: 'packt-machine-learning-for-algorithmic-trading-second-edition',
    title: 'Machine Learning for Algorithmic Trading - Second Edition',
    issuer: 'Packt',
    date: '2024-08-24',
    group: 'Data & Analytics',
    credentialId: '139242391',
    file: '/certificates/courses/packt-machine-learning-for-algorithmic-trading-second-edition.pdf',
    ext: 'pdf',
    tags: ['Machine Learning', 'Quantitative Finance', 'Trading'],
  },
  {
    id: 'stone-river-serialization-oracle-java-se-8-certification',
    title: 'Serialization - Oracle Java SE 8 Certification',
    issuer: 'Stone River eLearning',
    date: '2024-07-02',
    group: 'Systems & Languages',
    credentialId: '132880239',
    file: '/certificates/courses/stone-river-serialization-oracle-java-se-8-certification.pdf',
    ext: 'pdf',
    tags: ['Java', 'Serialization'],
  },
  {
    id: 'stone-river-learn-c-programming-from-scratch',
    title: 'Learn C Programming from Scratch',
    issuer: 'Stone River eLearning',
    date: '2024-05-18',
    group: 'Systems & Languages',
    credentialId: '92569855',
    file: '/certificates/courses/stone-river-learn-c-programming-from-scratch.pdf',
    ext: 'pdf',
    tags: ['C'],
  },
  {
    id: 'packt-adversarial-tradecraft-in-cybersecurity',
    title: 'Adversarial Tradecraft in Cybersecurity',
    issuer: 'Packt',
    date: '2024-05-17',
    group: 'Security',
    credentialId: '89264408',
    file: '/certificates/courses/packt-adversarial-tradecraft-in-cybersecurity.pdf',
    ext: 'pdf',
    tags: ['Adversarial Tactics', 'Detection'],
  },
  {
    id: 'packt-python-ethical-hacking-from-scratch',
    title: 'Python Ethical Hacking from Scratch',
    issuer: 'Packt',
    date: '2024-05-02',
    group: 'Security',
    credentialId: '112205871',
    file: '/certificates/courses/packt-python-ethical-hacking-from-scratch.pdf',
    ext: 'pdf',
    tags: ['Python', 'Ethical Hacking', 'Offensive Security'],
  },
  {
    id: 'mathworks-matlab-onramp',
    title: 'MATLAB Onramp',
    issuer: 'MathWorks',
    date: '2024-01-10',
    group: 'Data & Analytics',
    file: '/certificates/courses/mathworks-matlab-onramp.pdf',
    ext: 'pdf',
    tags: ['MATLAB'],
  },
  {
    id: 'nvidia-dli-disaster-risk-monitoring-using-satellite-imagery',
    title: 'Disaster Risk Monitoring Using Satellite Imagery',
    issuer: 'NVIDIA Deep Learning Institute',
    date: '2023-12-28',
    group: 'AI & ML',
    credentialId: '15f34263397c4584b947c5d6b449139a',
    file: '/certificates/courses/nvidia-dli-disaster-risk-monitoring-using-satellite-imagery.pdf',
    ext: 'pdf',
    tags: ['Geospatial AI', 'Satellite Imagery'],
    excluded: 'Shown as a distinction row above, with this file as its proof link.',
  },
  {
    id: 'stone-river-bash-scripting-and-shell-programming',
    title: 'Bash Scripting and Shell Programming',
    issuer: 'Stone River eLearning',
    date: '2023-12-24',
    group: 'Systems & Languages',
    credentialId: '112301929',
    file: '/certificates/courses/stone-river-bash-scripting-and-shell-programming.pdf',
    ext: 'pdf',
    tags: ['Bash', 'Shell'],
  },
  {
    id: 'packt-ultimate-java-masterclass',
    title: 'Ultimate Java Masterclass',
    issuer: 'Packt',
    date: '2023-12-21',
    group: 'Systems & Languages',
    credentialId: '110090816',
    file: '/certificates/courses/packt-ultimate-java-masterclass.pdf',
    ext: 'pdf',
    tags: ['Java'],
  },
  {
    id: 'upskillist-network-segmentation-for-iot-devices',
    title: 'Network segmentation for IoT devices',
    issuer: 'Upskillist',
    date: '2023-07-20',
    group: 'Security',
    credentialId: '94936054',
    file: '/certificates/courses/upskillist-network-segmentation-for-iot-devices.pdf',
    ext: 'pdf',
    tags: ['Network Security', 'IoT'],
  },
  {
    id: 'packt-docker-for-the-absolute-beginner-hands-on',
    title: 'Docker for the Absolute Beginner - Hands-On',
    issuer: 'Packt',
    date: '2023-07-17',
    group: 'Cloud & Web',
    credentialId: '91645694',
    file: '/certificates/courses/packt-docker-for-the-absolute-beginner-hands-on.pdf',
    ext: 'pdf',
    tags: ['Docker', 'Containers'],
  },
  {
    id: 'stone-river-reverse-engineering-windows-executables-digital-forensics-for-cyber-professionals',
    title: 'Reverse Engineering Windows Executables - Digital Forensics for Cyber Professionals',
    issuer: 'Stone River eLearning',
    date: '2023-07-16',
    group: 'Security',
    credentialId: '94516492',
    file: '/certificates/courses/stone-river-reverse-engineering-windows-executables-digital-forensics-for-cyber-professionals.pdf',
    ext: 'pdf',
    tags: ['Reverse Engineering', 'Digital Forensics'],
  },
  {
    id: 'stone-river-from-zero-to-flask-the-professional-way',
    title: 'From Zero to Flask: The Professional Way',
    issuer: 'Stone River eLearning',
    date: '2023-06-17',
    group: 'Cloud & Web',
    credentialId: '89773970',
    file: '/certificates/courses/stone-river-from-zero-to-flask-the-professional-way.pdf',
    ext: 'pdf',
    tags: ['Flask', 'Web Backend'],
  },
  {
    id: 'bobs-business-osint-open-source-intelligence',
    title: 'OSINT: Open Source Intelligence',
    issuer: 'Bob\'s Business',
    date: '2023-06-03',
    group: 'Security',
    credentialId: '90680700',
    file: '/certificates/courses/bobs-business-osint-open-source-intelligence.pdf',
    ext: 'pdf',
    tags: ['OSINT', 'Reconnaissance'],
  },
  {
    id: 'packt-data-structures-and-algorithms-the-complete-masterclass',
    title: 'Data Structures and Algorithms: The Complete Masterclass',
    issuer: 'Packt',
    date: '2023-05-22',
    group: 'Data & Analytics',
    credentialId: '85978447',
    file: '/certificates/courses/packt-data-structures-and-algorithms-the-complete-masterclass.pdf',
    ext: 'pdf',
    tags: ['Data Structures', 'Algorithms'],
  },
  {
    id: 'packt-concurrent-and-parallel-programming-in-python',
    title: 'Concurrent and Parallel Programming in Python',
    issuer: 'Packt',
    date: '2023-05-16',
    group: 'Systems & Languages',
    credentialId: '88496542',
    file: '/certificates/courses/packt-concurrent-and-parallel-programming-in-python.pdf',
    ext: 'pdf',
    tags: ['Python', 'Concurrency', 'Parallelism'],
  },
  {
    id: 'packt-a-reddit-and-hackernews-search-engine',
    title: 'A Reddit and HackerNews Search Engine',
    issuer: 'Packt',
    date: '2023-05-16',
    group: 'Cloud & Web',
    credentialId: '89025197',
    file: '/certificates/courses/packt-a-reddit-and-hackernews-search-engine.pdf',
    ext: 'pdf',
    tags: ['Web Scraping', 'Search'],
  },
  {
    id: 'packt-sql-server-course-for-beginners-with-100-examples',
    title: 'SQL Server Course for Beginners with 100+ examples',
    issuer: 'Packt',
    date: '2023-05-04',
    group: 'Data & Analytics',
    credentialId: '88081754',
    file: '/certificates/courses/packt-sql-server-course-for-beginners-with-100-examples.pdf',
    ext: 'pdf',
    tags: ['SQL', 'Databases'],
  },
  {
    id: 'packt-overview-of-threading-module',
    title: 'Overview of Threading Module',
    issuer: 'Packt',
    date: '2023-04-29',
    group: 'Systems & Languages',
    credentialId: '87601005',
    file: '/certificates/courses/packt-overview-of-threading-module.pdf',
    ext: 'pdf',
    tags: ['Threading', 'Concurrency'],
  },
  {
    id: 'packt-multithreading-in-gui-programming',
    title: 'Multithreading in GUI Programming',
    issuer: 'Packt',
    date: '2023-04-29',
    group: 'Systems & Languages',
    credentialId: '87601506',
    file: '/certificates/courses/packt-multithreading-in-gui-programming.pdf',
    ext: 'pdf',
    tags: ['Threading', 'Concurrency'],
  },
  {
    id: 'stone-river-devops-webpage-google-cloud-architect-exam-bootcamp-2019',
    title: 'DevOps Webpage - Google Cloud Architect Exam Bootcamp 2019',
    issuer: 'Stone River eLearning',
    date: '2023-04-26',
    group: 'Cloud & Web',
    credentialId: '87314648',
    file: '/certificates/courses/stone-river-devops-webpage-google-cloud-architect-exam-bootcamp-2019.pdf',
    ext: 'pdf',
    tags: ['DevOps', 'Google Cloud', 'Cloud Architecture'],
  },
  {
    id: 'packt-parallel-training-with-multiple-gpus',
    title: 'Parallel Training with Multiple GPUs',
    issuer: 'Packt',
    date: '2023-04-22',
    group: 'AI & ML',
    credentialId: '87037304',
    file: '/certificates/courses/packt-parallel-training-with-multiple-gpus.pdf',
    ext: 'pdf',
    tags: ['GPU', 'Distributed Training', 'Parallelism'],
  },
  {
    id: 'packt-deep-learning-cnn-convolutional-neural-networks-with-python',
    title: 'Deep Learning CNN: Convolutional Neural Networks with Python',
    issuer: 'Packt',
    date: '2023-04-18',
    group: 'AI & ML',
    credentialId: '85972808',
    file: '/certificates/courses/packt-deep-learning-cnn-convolutional-neural-networks-with-python.pdf',
    ext: 'pdf',
    tags: ['Deep Learning', 'CNN', 'Python'],
  },
  {
    id: 'packt-deep-learning-recurrent-neural-networks-with-python',
    title: 'Deep Learning: Recurrent Neural Networks with Python',
    issuer: 'Packt',
    date: '2023-04-08',
    group: 'AI & ML',
    credentialId: '84810786',
    file: '/certificates/courses/packt-deep-learning-recurrent-neural-networks-with-python.pdf',
    ext: 'pdf',
    tags: ['Deep Learning', 'RNN', 'Python'],
  },
  {
    id: 'packt-reinforcement-learning-and-deep-rl-python-theory-and-projects',
    title: 'Reinforcement Learning and Deep RL Python (Theory and Projects)',
    issuer: 'Packt',
    date: '2023-03-24',
    group: 'AI & ML',
    credentialId: '83776950',
    file: '/certificates/courses/packt-reinforcement-learning-and-deep-rl-python-theory-and-projects.pdf',
    ext: 'pdf',
    tags: ['Reinforcement Learning', 'Python'],
  },
  {
    id: 'packt-recurrent-networks-rnn-and-lstm-gru',
    title: 'Recurrent Networks, RNN, and LSTM, GRU',
    issuer: 'Packt',
    date: '2023-03-24',
    group: 'AI & ML',
    credentialId: '84809727',
    file: '/certificates/courses/packt-recurrent-networks-rnn-and-lstm-gru.pdf',
    ext: 'pdf',
    tags: ['RNN', 'LSTM', 'GRU'],
  },
  {
    id: 'packt-practical-reinforcement-learning-agents-and-environments',
    title: 'Practical Reinforcement Learning - Agents and Environments',
    issuer: 'Packt',
    date: '2023-03-14',
    group: 'AI & ML',
    credentialId: '83767840',
    file: '/certificates/courses/packt-practical-reinforcement-learning-agents-and-environments.pdf',
    ext: 'pdf',
    tags: ['Reinforcement Learning'],
  },
  {
    id: 'packt-deep-learning-for-python-developers',
    title: 'Deep Learning for Python Developers',
    issuer: 'Packt',
    date: '2023-03-12',
    group: 'AI & ML',
    credentialId: '80178705',
    file: '/certificates/courses/packt-deep-learning-for-python-developers.pdf',
    ext: 'pdf',
    tags: ['Deep Learning', 'Python'],
  },
  {
    id: 'packt-hands-on-artificial-intelligence-with-keras-and-python',
    title: 'Hands-On Artificial Intelligence with Keras and Python',
    issuer: 'Packt',
    date: '2023-03-07',
    group: 'AI & ML',
    credentialId: '79057631',
    file: '/certificates/courses/packt-hands-on-artificial-intelligence-with-keras-and-python.pdf',
    ext: 'pdf',
    tags: ['Artificial Intelligence', 'Keras', 'Python'],
  },
  {
    id: 'packt-python-script-to-attack-on-instagram',
    title: 'Python Script to Attack on Instagram',
    issuer: 'Packt',
    date: '2023-02-28',
    group: 'Security',
    credentialId: '82846994',
    file: '/certificates/courses/packt-python-script-to-attack-on-instagram.pdf',
    ext: 'pdf',
    tags: ['Python'],
    excluded: 'Withheld from the register - the course title reads as account-attack tooling out of context.',
  },
  {
    id: 'packt-python-for-game-ai',
    title: 'Python for Game AI',
    issuer: 'Packt',
    date: '2023-02-28',
    group: 'Graphics & Vision',
    credentialId: '82848571',
    file: '/certificates/courses/packt-python-for-game-ai.pdf',
    ext: 'pdf',
    tags: ['Python', 'Game AI'],
  },
  {
    id: 'packt-learning-csharp-by-developing-games-with-unity',
    title: 'Learning C# by Developing Games with Unity',
    issuer: 'Packt',
    date: '2023-02-23',
    group: 'Graphics & Vision',
    credentialId: '81920503',
    file: '/certificates/courses/packt-learning-csharp-by-developing-games-with-unity.pdf',
    ext: 'pdf',
    tags: ['Unity', 'Game Development'],
  },
  {
    id: 'creativelive-blender-brushes-advanced-techniques-with-brushes-in-photoshop-cc',
    title: 'Blender Brushes (Advanced Techniques with Brushes in Photoshop CC)',
    issuer: 'CreativeLive',
    date: '2023-02-09',
    group: 'Data & Analytics',
    credentialId: '81311283',
    file: '/certificates/courses/creativelive-blender-brushes-advanced-techniques-with-brushes-in-photoshop-cc.pdf',
    ext: 'pdf',
    tags: ['Data'],
    excluded: 'Non-technical.',
  },
  {
    id: 'prositions-learning-how-operating-systems-talk-to-hardware',
    title: 'Learning How Operating Systems Talk to Hardware',
    issuer: 'Prositions, Inc.',
    date: '2023-01-23',
    group: 'Systems & Languages',
    credentialId: '79705773',
    file: '/certificates/courses/prositions-learning-how-operating-systems-talk-to-hardware.pdf',
    ext: 'pdf',
    tags: ['Operating Systems', 'Hardware'],
  },
  {
    id: 'prositions-discovering-computer-operating-systems',
    title: 'Discovering Computer Operating Systems',
    issuer: 'Prositions, Inc.',
    date: '2023-01-23',
    group: 'Systems & Languages',
    credentialId: '79705847',
    file: '/certificates/courses/prositions-discovering-computer-operating-systems.pdf',
    ext: 'pdf',
    tags: ['Operating Systems'],
  },
  {
    id: 'kaggle-intermediate-machine-learning',
    title: 'Intermediate Machine Learning',
    issuer: 'Kaggle',
    date: '2023-01-23',
    group: 'AI & ML',
    file: '/certificates/courses/kaggle-intermediate-machine-learning.png',
    ext: 'png',
    tags: ['Machine Learning'],
  },
  {
    id: 'kaggle-intro-to-programming',
    title: 'Intro to Programming',
    issuer: 'Kaggle',
    date: '2023-01-22',
    group: 'AI & ML',
    file: '/certificates/courses/kaggle-intro-to-programming.png',
    ext: 'png',
    tags: ['AI'],
  },
  {
    id: 'kaggle-intro-to-machine-learning',
    title: 'Intro to Machine Learning',
    issuer: 'Kaggle',
    date: '2023-01-22',
    group: 'AI & ML',
    file: '/certificates/courses/kaggle-intro-to-machine-learning.png',
    ext: 'png',
    tags: ['Machine Learning'],
  },
  {
    id: 'packt-python-machine-learning-in-7-days',
    title: 'Python Machine Learning in 7 Days',
    issuer: 'Packt',
    date: '2023-01-19',
    group: 'AI & ML',
    credentialId: '79057788',
    file: '/certificates/courses/packt-python-machine-learning-in-7-days.pdf',
    ext: 'pdf',
    tags: ['Machine Learning', 'Python'],
  },
  {
    id: 'iaap-excel-2019-advanced-iaap-recertification',
    title: 'Excel 2019 Advanced (IAAP Recertification)',
    issuer: 'IAAP',
    date: '2023-01-19',
    group: 'Data & Analytics',
    file: '/certificates/courses/iaap-excel-2019-advanced-iaap-recertification.pdf',
    ext: 'pdf',
    tags: ['Excel', 'Spreadsheets'],
  },
  {
    id: 'mi-crow-mindfulness-the-universe-of-change',
    title: 'Mindfulness - The Universe of Change',
    issuer: 'Mi-Crow',
    date: '2023-01-18',
    group: 'Data & Analytics',
    credentialId: '79401263',
    file: '/certificates/courses/mi-crow-mindfulness-the-universe-of-change.pdf',
    ext: 'pdf',
    tags: ['Data'],
    excluded: 'Non-technical.',
  },
  {
    id: 'intellezy-excel-2019-advanced',
    title: 'Excel 2019 Advanced',
    issuer: 'Intellezy',
    date: '2023-01-18',
    group: 'Data & Analytics',
    credentialId: '79415521',
    file: '/certificates/courses/intellezy-excel-2019-advanced.pdf',
    ext: 'pdf',
    tags: ['Excel', 'Spreadsheets'],
  },
  {
    id: 'iam-learning-energy-efficiency-cpd-certified',
    title: 'Energy Efficiency (CPD Certified)',
    issuer: 'iAM Learning',
    date: '2023-01-18',
    group: 'Data & Analytics',
    credentialId: '79412726',
    file: '/certificates/courses/iam-learning-energy-efficiency-cpd-certified.pdf',
    ext: 'pdf',
    tags: ['Data'],
    excluded: 'Non-technical.',
  },
  {
    id: 'stem-inc-maker-beginner-livecode-and-arduino',
    title: 'Maker - Beginner (Livecode and Arduino)',
    issuer: 'STEM Inc.',
    date: '2019-07-11',
    group: 'Systems & Languages',
    file: '/certificates/courses/stem-inc-maker-beginner-livecode-and-arduino.pdf',
    ext: 'pdf',
    tags: ['Arduino', 'Embedded'],
  },
];

/** The 43 rows the register renders. */
export const listedCertifications: Certification[] = certifications.filter(
  (certification) => !certification.excluded,
);

const yearOf = (certification: Certification) => certification.date.slice(0, 4);

/** Inclusive year span of the listed rows, for the register heading. */
export const certificationSpan = (() => {
  const years = listedCertifications.map(yearOf).sort();
  return { from: years[0], to: years[years.length - 1] };
})();

/** Listed rows per group, in chip order - drives the collapsed summary line. */
export const certificationCounts: ReadonlyArray<{ id: CertGroup; label: string; count: number }> =
  CERT_GROUPS.filter((group): group is { id: CertGroup; label: string } => group.id !== 'ALL').map(
    (group) => ({
      ...group,
      count: listedCertifications.filter((certification) => certification.group === group.id).length,
    }),
  );

/** Same shape as filterArchiveRows in lib/workbench.ts, over the register. */
export const filterCertifications = (query: string, group: CertGroup | 'ALL'): Certification[] => {
  const needle = query.trim().toLowerCase();
  return listedCertifications.filter(
    (certification) =>
      (group === 'ALL' || certification.group === group) &&
      (!needle ||
        `${certification.title} ${certification.issuer} ${certification.group} ${certification.tags.join(' ')}`
          .toLowerCase()
          .includes(needle)),
  );
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Formats a row's date as e.g. "Jan 2026". */
export const certificationDateLabel = (certification: Certification): string => {
  const [year, month] = certification.date.split('-');
  return `${MONTHS[Number(month) - 1]} ${year}`;
};

/** Lookup for the certification field notes in portfolioData.ts. */
export const certificationById = new Map(
  certifications.map((certification) => [certification.id, certification]),
);
