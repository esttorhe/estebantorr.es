// ABOUTME: Defines the grouped narrative for /cv/ — companies (or eras) bundled with a short paragraph + the roles inside.
// ABOUTME: Narratives are drawn strictly from the role descriptions in external/cv/cv.md (no invented metrics or stories).

export interface CvGroup {
  /** Group heading — usually a company + city. */
  title: string;
  /** Span covering the entire group. Drives the mono kicker beside the title. */
  dateRange: string;
  /** 1–3 sentence narrative summarising the group; rendered as prose above the role list. */
  narrative: string;
  /**
   * Stable role keys (matches cvParser's `key`: `${company}|${title}`) that
   * belong to this group, in display order (newest first within the group).
   */
  roleKeys: string[];
}

/**
 * Group display order. Top of the list shows first on the page.
 *
 * Role keys MUST match `${company}|${title}` exactly as cvParser produces them
 * from external/cv/cv.md. The 'Earlier Career|' key has an empty title because
 * the consolidated cv.md emits that block without a role title.
 */
export const cvGroups: CvGroup[] = [
  {
    title: 'Peec AI · Berlin',
    dateRange: 'Aug 2026 → present',
    narrative:
      'Leading the platform team that lays the foundations every other team builds on, powering AI search analytics for marketing teams.',
    roleKeys: ['Peec AI|Engineering Manager'],
  },
  {
    title: 'Zenjob · Berlin',
    dateRange: 'May 2023 → Aug 2026',
    narrative:
      'Joined as Engineering Manager for Platform & DevOps, where I led delivery of an API Gateway and APM service and improved CI/CD pipeline stability by over 50%. Promoted to Head of Engineering for the Supply vertical (3 EMs, 30+ engineers) bridging a company-wide React Native migration. Finished as Head of Platform Engineering supporting 60+ product engineers across the company, owning infrastructure, observability, developer tooling, and the org-wide rollout of AI-assisted development.',
    roleKeys: [
      'Zenjob|Head of Platform Engineering',
      'Zenjob|Head of Engineering (Supply Vertical)',
      'Zenjob|Engineering Manager (Platform & DevOps)',
    ],
  },
  {
    title: 'Spotify · Berlin',
    dateRange: 'Jan 2022 → May 2023',
    narrative:
      'Led a distributed team across Sweden, the UK, Germany, Colorado, and New York building Backstage, Spotify’s open-source developer platform. Defined the plugin marketplace architecture and contribution model, and shipped the first three monetised plugins, which became a new revenue stream for the company.',
    roleKeys: ['Spotify|Engineering Manager (Remote)'],
  },
  {
    title: 'SoundCloud · Berlin',
    dateRange: 'Oct 2016 → Jan 2022',
    narrative:
      'Started as an iOS Developer architecting modular framework extractions adopted across the iOS organization. Moved into Core Clients, writing Swift + Ruby developer tooling that cut compile times by seven minutes and reduced integration time by 50%. Ended leading the BEEP and Core Clients teams, owning JVMKit, the shared platform powering 200+ microservices and 175M+ monthly users.',
    roleKeys: [
      'SoundCloud|Engineering Manager, Back-End Engineering Productivity',
      'SoundCloud|Core Clients Engineer',
      'SoundCloud|iOS Developer',
    ],
  },
  {
    title: 'Earlier career',
    dateRange: '2005 → 2016',
    narrative:
      'Progressive engineering and leadership roles before joining SoundCloud. Full detail in the line below.',
    roleKeys: ['Earlier Career|'],
  },
];

/** Build a Map keyed by role-key for O(1) group lookup during render. */
export function buildRoleToGroupIndex(): Map<string, CvGroup> {
  const index = new Map<string, CvGroup>();
  for (const group of cvGroups) {
    for (const key of group.roleKeys) {
      index.set(key, group);
    }
  }
  return index;
}
