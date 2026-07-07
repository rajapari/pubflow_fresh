/**
 * Canonical publisher → publications catalogue seeded into every new tenant.
 * The submission wizard cascades publisher → journal, and cloud-storage
 * folders derive from this hierarchy: {tenant}/{publisher}/{journal}/{submission}/…
 *
 * Tenant admins can add their own publishers/publications on top.
 * Sources: official journal ISSN databases / publisher websites (July 2026).
 */

export interface DefaultPublication {
  title: string
  type: 'JOURNAL' | 'BOOK'
  issn?: string
  isbn?: string
  description: string
}

export interface DefaultPublisher {
  name: string
  publications: DefaultPublication[]
}

export const DEFAULT_PUBLISHERS: DefaultPublisher[] = [
  {
    name: 'Springer Nature',
    publications: [
      { title: 'Nature',                    type: 'JOURNAL', issn: '0028-0836', description: 'International weekly journal of science.' },
      { title: 'Nature Communications',     type: 'JOURNAL', issn: '2041-1723', description: 'Open-access multidisciplinary journal covering all natural sciences.' },
      { title: 'Scientific Reports',        type: 'JOURNAL', issn: '2045-2322', description: 'Open-access multidisciplinary journal — Nature Portfolio.' },
      { title: 'Nature Machine Intelligence', type: 'JOURNAL', issn: '2522-5839', description: 'AI, machine learning, and intelligent systems.' },
      { title: 'Nature Physics',            type: 'JOURNAL', issn: '1745-2473', description: 'Physics research across all subfields.' },
      { title: 'Nature Neuroscience',       type: 'JOURNAL', issn: '1097-6256', description: 'Neuroscience research.' },
      { title: 'Nature Cell Biology',       type: 'JOURNAL', issn: '1465-7392', description: 'Cell biology research.' },
      { title: 'Nature Climate Change',     type: 'JOURNAL', issn: '1758-678X', description: 'Climate change research and impacts.' },
      { title: 'BMC Medicine',              type: 'JOURNAL', issn: '1741-7015', description: 'Open-access general medical journal — BioMed Central.' },
      { title: 'Genome Biology',            type: 'JOURNAL', issn: '1474-760X', description: 'Open-access genomics research — BioMed Central.' },
      { title: 'Springer Nature – Books',   type: 'BOOK',    description: 'Academic and professional book submissions.' },
    ],
  },
  {
    name: 'Elsevier',
    publications: [
      { title: 'The Lancet',     type: 'JOURNAL', issn: '0140-6736', description: 'International general medical journal.' },
      { title: 'Cell',           type: 'JOURNAL', issn: '0092-8674', description: 'Cutting-edge research across the life sciences — Cell Press.' },
      { title: 'Neuron',         type: 'JOURNAL', issn: '0896-6273', description: 'Cellular and molecular neuroscience — Cell Press.' },
      { title: 'Molecular Cell', type: 'JOURNAL', issn: '1097-2765', description: 'Molecular biology and biochemistry — Cell Press.' },
    ],
  },
  {
    name: 'Taylor & Francis',
    publications: [
      { title: 'Journal of Modern Optics',                    type: 'JOURNAL', issn: '0950-0340', description: 'Optical science and engineering.' },
      { title: 'International Journal of Production Research', type: 'JOURNAL', issn: '0020-7543', description: 'Manufacturing and production engineering research.' },
      { title: 'Journal of Sports Sciences',                  type: 'JOURNAL', issn: '0264-0414', description: 'Sport and exercise science research.' },
      { title: 'Routledge – Books',                           type: 'BOOK',    description: 'Humanities and social science book submissions — Routledge.' },
    ],
  },
  {
    name: 'Wiley',
    publications: [
      { title: 'Angewandte Chemie International Edition', type: 'JOURNAL', issn: '1433-7851', description: 'International journal of chemistry — with the German Chemical Society.' },
      { title: 'Global Change Biology',                   type: 'JOURNAL', issn: '1354-1013', description: 'Ecology and global change.' },
    ],
  },
  {
    name: 'AAAS',
    publications: [
      { title: 'Science',          type: 'JOURNAL', issn: '0036-8075', description: 'Peer-reviewed journal of the American Association for the Advancement of Science.' },
      { title: 'Science Advances', type: 'JOURNAL', issn: '2375-2548', description: 'Open-access multidisciplinary journal.' },
    ],
  },
  {
    name: 'American Chemical Society',
    publications: [
      { title: 'Journal of the American Chemical Society', type: 'JOURNAL', issn: '0002-7863', description: 'Flagship chemistry journal.' },
      { title: 'ACS Nano',                                 type: 'JOURNAL', issn: '1936-0851', description: 'Nanoscience and nanotechnology.' },
      { title: 'Environmental Science & Technology',       type: 'JOURNAL', issn: '0013-936X', description: 'Environmental science and engineering.' },
    ],
  },
  {
    name: 'PLOS',
    publications: [
      { title: 'PLOS ONE',                  type: 'JOURNAL', issn: '1932-6203', description: 'Inclusive open-access journal across science and medicine.' },
      { title: 'PLOS Biology',              type: 'JOURNAL', issn: '1544-9173', description: 'Open-access biological sciences journal.' },
      { title: 'PLOS Medicine',             type: 'JOURNAL', issn: '1549-1676', description: 'Open-access journal for research in the health sciences.' },
      { title: 'PLOS Genetics',             type: 'JOURNAL', issn: '1553-7390', description: 'Open-access genetics and genomics journal.' },
      { title: 'PLOS Computational Biology', type: 'JOURNAL', issn: '1553-7358', description: 'Computational biology.' },
    ],
  },
  {
    name: 'IEEE',
    publications: [
      { title: 'IEEE Transactions on Pattern Analysis and Machine Intelligence', type: 'JOURNAL', issn: '0162-8828', description: 'Computer vision and machine learning — IEEE Computer Society.' },
    ],
  },
  {
    name: 'ACM',
    publications: [
      { title: 'ACM Computing Surveys',     type: 'JOURNAL', issn: '0360-0300', description: 'Comprehensive surveys in computing.' },
      { title: 'Communications of the ACM', type: 'JOURNAL', issn: '0001-0782', description: 'Computing research and practice.' },
    ],
  },
  {
    name: 'American Physical Society',
    publications: [
      { title: 'Physical Review Letters', type: 'JOURNAL', issn: '0031-9007', description: 'Letters on physics.' },
    ],
  },
  {
    name: 'Frontiers',
    publications: [
      { title: 'Frontiers in Medicine',      type: 'JOURNAL', issn: '2296-858X', description: 'Open-access clinical medicine and translational research.' },
      { title: 'Frontiers in Neuroscience',  type: 'JOURNAL', issn: '1662-453X', description: 'Open-access neuroscience journal.' },
      { title: 'Frontiers in Psychology',    type: 'JOURNAL', issn: '1664-1078', description: 'Open-access psychology journal.' },
    ],
  },
  {
    name: 'Massachusetts Medical Society',
    publications: [
      { title: 'The New England Journal of Medicine', type: 'JOURNAL', issn: '0028-4793', description: 'Leading peer-reviewed medical journal.' },
    ],
  },
  {
    name: 'BMJ Group',
    publications: [
      { title: 'BMJ – British Medical Journal', type: 'JOURNAL', issn: '0959-8138', description: 'International peer-reviewed medical journal.' },
    ],
  },
  {
    name: 'American Medical Association',
    publications: [
      { title: 'JAMA – Journal of the American Medical Association', type: 'JOURNAL', issn: '0098-7484', description: 'Peer-reviewed general medical journal.' },
    ],
  },
  {
    name: 'National Academy of Sciences',
    publications: [
      { title: 'PNAS – Proceedings of the National Academy of Sciences', type: 'JOURNAL', issn: '0027-8424', description: 'Multidisciplinary scientific research.' },
    ],
  },
  {
    name: 'eLife Sciences',
    publications: [
      { title: 'eLife', type: 'JOURNAL', issn: '2050-084X', description: 'Open-access journal for the life sciences and biomedicine.' },
    ],
  },
  {
    name: 'The Royal Society',
    publications: [
      { title: 'Royal Society Open Science', type: 'JOURNAL', issn: '2054-5703', description: 'Open-access journal covering all of science.' },
    ],
  },
  {
    name: 'Oxford University Press',
    publications: [
      { title: 'Oxford University Press – Monographs', type: 'BOOK', description: 'Academic book submissions.' },
    ],
  },
  {
    name: 'MIT Press',
    publications: [
      { title: 'Journal of Machine Learning Research', type: 'JOURNAL', issn: '1533-7928', description: 'Open-access machine learning research.' },
      { title: 'MIT Press – Books',                    type: 'BOOK',    description: 'Academic books in science, technology, and the arts.' },
    ],
  },
]

// Flat view kept for backwards compatibility with existing imports.
export const DEFAULT_PUBLICATIONS = DEFAULT_PUBLISHERS.flatMap(p => p.publications)

type PrismaLike = {
  publisher: { upsert: (args: any) => Promise<{ id: string }> }
  publication: { createMany: (args: any) => Promise<unknown>; updateMany: (args: any) => Promise<unknown> }
}

/**
 * Idempotently seed the publisher → publication catalogue for a tenant.
 * Safe to call on every login (unique constraints + skipDuplicates); also
 * links any pre-existing unlinked publications to their publisher by title.
 */
export async function seedDefaultCatalog(db: PrismaLike, tenantId: string): Promise<void> {
  for (const pub of DEFAULT_PUBLISHERS) {
    const publisher = await db.publisher.upsert({
      where:  { tenantId_name: { tenantId, name: pub.name } },
      update: {},
      create: { tenantId, name: pub.name },
    })
    await db.publication.createMany({
      data: pub.publications.map(p => ({
        tenantId,
        publisherId: publisher.id,
        title:       p.title,
        type:        p.type,
        issn:        p.issn ?? undefined,
        isbn:        p.isbn ?? undefined,
        description: p.description,
        status:      'ACTIVE',
      })),
      skipDuplicates: true,
    })
    // Adopt publications that existed before publishers were introduced
    await db.publication.updateMany({
      where: { tenantId, publisherId: null, title: { in: pub.publications.map(p => p.title) } },
      data:  { publisherId: publisher.id },
    })
  }
}
