/**
 * Canonical list of well-known, currently active publications seeded into every
 * new tenant.  During the testing phase any user can submit to these journals;
 * tenant admins can add their own publications on top of this baseline.
 *
 * Sources: official journal ISSN databases / publisher websites (July 2026).
 */
export const DEFAULT_PUBLICATIONS = [
  // ── Multidisciplinary ───────────────────────────────────────────────────
  { title: 'Nature',                          type: 'JOURNAL', issn: '0028-0836', description: 'International weekly journal of science — Springer Nature.' },
  { title: 'Science',                          type: 'JOURNAL', issn: '0036-8075', description: 'Peer-reviewed journal of the American Association for the Advancement of Science (AAAS).' },
  { title: 'PNAS – Proceedings of the National Academy of Sciences', type: 'JOURNAL', issn: '0027-8424', description: 'Multidisciplinary scientific research — National Academy of Sciences, USA.' },
  { title: 'Scientific Reports',               type: 'JOURNAL', issn: '2045-2322', description: 'Open-access multidisciplinary journal — Nature Portfolio.' },
  { title: 'Nature Communications',            type: 'JOURNAL', issn: '2041-1723', description: 'Open-access multidisciplinary journal covering all areas of natural sciences — Nature Portfolio.' },
  { title: 'PLOS ONE',                         type: 'JOURNAL', issn: '1932-6203', description: 'Inclusive open-access journal across science and medicine — Public Library of Science.' },
  { title: 'eLife',                            type: 'JOURNAL', issn: '2050-084X', description: 'Open-access journal for outstanding research in the life sciences and biomedicine.' },
  { title: 'Royal Society Open Science',       type: 'JOURNAL', issn: '2054-5703', description: 'Open-access journal covering all of science — The Royal Society.' },

  // ── Medicine & Health ───────────────────────────────────────────────────
  { title: 'The New England Journal of Medicine', type: 'JOURNAL', issn: '0028-4793', description: 'Leading peer-reviewed medical journal — Massachusetts Medical Society.' },
  { title: 'The Lancet',                          type: 'JOURNAL', issn: '0140-6736', description: 'International general medical journal — Elsevier.' },
  { title: 'JAMA – Journal of the American Medical Association', type: 'JOURNAL', issn: '0098-7484', description: 'Peer-reviewed general medical journal — American Medical Association.' },
  { title: 'BMJ – British Medical Journal',       type: 'JOURNAL', issn: '0959-8138', description: 'International peer-reviewed medical journal — BMJ Publishing Group.' },
  { title: 'PLOS Medicine',                       type: 'JOURNAL', issn: '1549-1676', description: 'Open-access journal for research in the health sciences — Public Library of Science.' },
  { title: 'BMC Medicine',                        type: 'JOURNAL', issn: '1741-7015', description: 'Open-access, general medical journal — BioMed Central / Springer Nature.' },
  { title: 'Frontiers in Medicine',               type: 'JOURNAL', issn: '2296-858X', description: 'Open-access journal covering clinical medicine and translational research — Frontiers.' },
  { title: 'Journal of Clinical Investigation',   type: 'JOURNAL', issn: '0021-9738', description: 'Basic and clinical biomedical research — American Society for Clinical Investigation.' },
  { title: 'Annals of Internal Medicine',         type: 'JOURNAL', issn: '0003-4819', description: 'Clinical and research articles in internal medicine — American College of Physicians.' },

  // ── Biology & Life Sciences ─────────────────────────────────────────────
  { title: 'Cell',                              type: 'JOURNAL', issn: '0092-8674', description: 'Cutting-edge research across the life sciences — Elsevier / Cell Press.' },
  { title: 'Nature Cell Biology',               type: 'JOURNAL', issn: '1465-7392', description: 'Cell biology research — Nature Portfolio.' },
  { title: 'PLOS Biology',                      type: 'JOURNAL', issn: '1544-9173', description: 'Open-access biological sciences journal — Public Library of Science.' },
  { title: 'PLOS Genetics',                     type: 'JOURNAL', issn: '1553-7390', description: 'Open-access genetics and genomics journal — Public Library of Science.' },
  { title: 'Genome Biology',                    type: 'JOURNAL', issn: '1474-760X', description: 'Open-access genomics research — BioMed Central / Springer Nature.' },
  { title: 'Molecular Cell',                    type: 'JOURNAL', issn: '1097-2765', description: 'Molecular biology and biochemistry — Cell Press / Elsevier.' },

  // ── Neuroscience & Psychology ───────────────────────────────────────────
  { title: 'Nature Neuroscience',               type: 'JOURNAL', issn: '1097-6256', description: 'Neuroscience research — Nature Portfolio.' },
  { title: 'Neuron',                            type: 'JOURNAL', issn: '0896-6273', description: 'Cellular and molecular neuroscience — Cell Press / Elsevier.' },
  { title: 'Frontiers in Neuroscience',         type: 'JOURNAL', issn: '1662-453X', description: 'Open-access neuroscience journal — Frontiers.' },
  { title: 'Psychological Science',             type: 'JOURNAL', issn: '0956-7976', description: 'Empirical research in psychology — Association for Psychological Science / SAGE.' },
  { title: 'Frontiers in Psychology',           type: 'JOURNAL', issn: '1664-1078', description: 'Open-access psychology journal — Frontiers.' },

  // ── Physical Sciences & Chemistry ──────────────────────────────────────
  { title: 'Physical Review Letters',           type: 'JOURNAL', issn: '0031-9007', description: 'Letters on physics — American Physical Society.' },
  { title: 'Nature Physics',                    type: 'JOURNAL', issn: '1745-2473', description: 'Physics research — Nature Portfolio.' },
  { title: 'Journal of the American Chemical Society', type: 'JOURNAL', issn: '0002-7863', description: 'Chemistry — American Chemical Society.' },
  { title: 'Angewandte Chemie International Edition', type: 'JOURNAL', issn: '1433-7851', description: 'International journal of chemistry — Wiley-VCH / German Chemical Society.' },
  { title: 'ACS Nano',                          type: 'JOURNAL', issn: '1936-0851', description: 'Nanoscience and nanotechnology — American Chemical Society.' },

  // ── Computer Science & Engineering ─────────────────────────────────────
  { title: 'Nature Machine Intelligence',       type: 'JOURNAL', issn: '2522-5839', description: 'AI, machine learning, and intelligent systems — Nature Portfolio.' },
  { title: 'IEEE Transactions on Pattern Analysis and Machine Intelligence', type: 'JOURNAL', issn: '0162-8828', description: 'Computer vision and machine learning — IEEE Computer Society.' },
  { title: 'Journal of Machine Learning Research', type: 'JOURNAL', issn: '1533-7928', description: 'Open-access machine learning research — MIT Press.' },
  { title: 'ACM Computing Surveys',             type: 'JOURNAL', issn: '0360-0300', description: 'Comprehensive surveys in computing — ACM.' },
  { title: 'Communications of the ACM',         type: 'JOURNAL', issn: '0001-0782', description: 'Computing research and practice — ACM.' },

  // ── Social Sciences & Economics ────────────────────────────────────────
  { title: 'American Economic Review',          type: 'JOURNAL', issn: '0002-8282', description: 'Economics — American Economic Association.' },
  { title: 'Science Advances',                  type: 'JOURNAL', issn: '2375-2548', description: 'Open-access multidisciplinary journal — AAAS.' },
  { title: 'PLOS Computational Biology',        type: 'JOURNAL', issn: '1553-7358', description: 'Computational biology — Public Library of Science.' },

  // ── Environmental & Earth Sciences ─────────────────────────────────────
  { title: 'Nature Climate Change',             type: 'JOURNAL', issn: '1758-678X', description: 'Climate change research and impacts — Nature Portfolio.' },
  { title: 'Global Change Biology',             type: 'JOURNAL', issn: '1354-1013', description: 'Ecology and global change — Wiley.' },
  { title: 'Environmental Science & Technology', type: 'JOURNAL', issn: '0013-936X', description: 'Environmental science and engineering — American Chemical Society.' },

  // ── Books ───────────────────────────────────────────────────────────────
  { title: 'Oxford University Press – Monographs', type: 'BOOK', isbn: '', description: 'Academic book submissions — Oxford University Press.' },
  { title: 'Springer Nature – Books',              type: 'BOOK', isbn: '', description: 'Academic and professional books — Springer Nature.' },
  { title: 'MIT Press – Books',                    type: 'BOOK', isbn: '', description: 'Academic books in science, technology, and the arts — MIT Press.' },
] as const satisfies Array<{
  title: string
  type: 'JOURNAL' | 'BOOK'
  issn?: string
  isbn?: string
  description: string
}>
