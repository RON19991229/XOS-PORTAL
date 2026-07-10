/**
 * X FITNESS — Terms & Conditions (official)
 *
 * Last updated: 2026-05-08 (v2.7.0)
 * Source: User-provided official document.
 *
 * Used by:
 *   - components/TermsContent.tsx — shown inline on /checkin/register
 *   - components/TermsModal.tsx   — popup on /checkin/reminders
 *
 * IMPORTANT: This is the legal-grade text. Do NOT casually edit
 * wording. If updates are needed, they should come from management
 * and be reviewed for legal/PDPA compliance.
 */

export interface TermsSection {
  title: string;
  items: string[];
}

export const termsIntro = `This site and all services offered herein are owned and operated by X FITNESS CENTRE (Business Registration No.: 202503023755, Old Registration No.: IP0604759-X) ("the Company").

While the official registered name is X FITNESS CENTRE, the brand is commonly referred to as X FITNESS across all signage, marketing materials, and social media platforms.

By checking and agreeing to these Terms & Conditions, you acknowledge that you have read, understood, and agreed to be bound by the terms set forth below.`;

export const termsSections: TermsSection[] = [
  {
    title: 'Walk-In Access',
    items: [
      'Walk-in entry is valid for one-time access only.',
      'Fees paid are non-refundable and non-transferable.',
      'All walk-in visitors are required to complete the designated check-in procedure before entering the premises.',
      'Failure or refusal to check in may result in immediate removal from the premises without refund.',
      'Sharing access, bypassing registration procedures, or unauthorized entry is strictly prohibited and may result in suspension or permanent banning.',
    ],
  },
  {
    title: 'Health & Safety',
    items: [
      'You confirm that you are physically fit to exercise and do not suffer from any medical condition that may endanger yourself or others.',
      'All equipment and facilities are used at your own risk.',
      'The Company shall not be held responsible for any injuries, accidents, illnesses, or health-related issues arising during your visit.',
      'Exercising under the influence of alcohol, drugs, or medication that may impair physical ability or judgment is strictly prohibited.',
    ],
  },
  {
    title: 'Gym Conduct',
    items: [
      'Proper gym attire and sports shoes must be worn at all times. Sandals or slippers are not permitted.',
      'Members and visitors must return all equipment and tools to their designated places after use.',
      'All weights, including dumbbells and bumper plates, must be re-racked after use.',
      'Slamming dumbbells on the floor unnecessarily or misusing gym equipment is strictly prohibited.',
      'Removing shirts in public areas is not allowed, except within the designated posing area.',
      'Respectful behaviour towards staff, members, and visitors is required at all times.',
      'Any disrespectful, threatening, dangerous, disruptive, or inappropriate behaviour may result in warnings, suspension, removal, or permanent banning without refund.',
    ],
  },
  {
    title: 'Prohibited Substances & Injection Activities',
    items: [
      'The use, possession, preparation, distribution, or administration of steroids, illegal drugs, or unauthorized performance-enhancing substances within the premises is strictly prohibited.',
      'Injecting or attempting to inject any substance within the gym premises, including in restrooms or changing areas, is strictly prohibited.',
      'Individuals found engaging in such activities may receive warnings, suspension, or immediate permanent banning depending on the severity or repeated nature of the offence.',
      'The Company reserves the right to report illegal activities to law enforcement authorities where necessary.',
    ],
  },
  {
    title: 'Equipment & Property',
    items: [
      'Any intentional or negligent damage to gym property, equipment, or facilities may result in compensation charges and possible legal action.',
    ],
  },
  {
    title: 'Personal Belongings',
    items: [
      'Members and visitors are responsible for securing their personal belongings.',
      'The Company shall not be responsible for any loss, theft, or damage to personal property.',
    ],
  },
  {
    title: 'Photography & Recording',
    items: [
      'Recording or photographing other members or visitors without their consent is strictly prohibited.',
      'Unauthorized commercial filming, photography, solicitation, or promotional activities within the premises are not permitted unless approved by management.',
    ],
  },
  {
    title: 'Age Requirement',
    items: [
      'Individuals below 12 years old are strictly prohibited from entering the gym area.',
      'Individuals aged 12 to 15 years old must be accompanied and supervised by a parent or legal guardian at all times while using the facilities.',
      'Individuals aged 16 years old and above may enter and use the facilities independently.',
    ],
  },
  {
    title: 'CCTV & Security Monitoring',
    items: [
      'CCTV surveillance is in operation within the premises for safety, security, operational, and investigation purposes.',
      'In the event of complaints, disputes, harassment, stalking, theft, vandalism, misconduct, accidents, or security incidents, CCTV recordings may be reviewed by authorized management personnel for investigation purposes.',
      'Where necessary, relevant CCTV footage and information may be provided to law enforcement authorities, legal representatives, insurance providers, or courts as supporting evidence.',
    ],
  },
  {
    title: 'PDPA Notice',
    items: [
      'By submitting this form, you consent to the collection, storage, processing, and use of your personal data in accordance with the Personal Data Protection Act 2010 (PDPA) for registration, operational, security, and safety purposes.',
      'Your personal information will be kept confidential and will only be accessible by authorized management-level personnel on a need-to-know basis.',
      'The Company will take reasonable and practical steps to protect your personal data from misuse, unauthorized access, modification, disclosure, or loss.',
    ],
  },
  {
    title: 'Personal Information Accuracy',
    items: [
      'You agree to provide accurate, complete, and truthful personal information, including your full name, IC/Passport number, and contact details when completing this form.',
      'The information provided may be used for identity verification, emergency response, insurance documentation, operational purposes, or compliance with legal and regulatory requirements.',
      'In the event of an accident, injury, medical emergency, property damage, criminal investigation, or legal dispute, the Company reserves the right to disclose relevant personal information to hospitals, emergency responders, insurance providers, legal representatives, or law enforcement authorities where necessary.',
      'Providing false, misleading, or incomplete information is strictly prohibited and may result in refusal of entry, suspension of access, and/or legal action.',
    ],
  },
  {
    title: 'Rule Enforcement & Ban Policy',
    items: [
      'The Company reserves the right to issue verbal warnings, written warnings, temporary suspensions, or permanent bans depending on the severity and frequency of rule violations.',
      'Repeated violations of gym rules may result in permanent removal from the premises and refusal of future entry.',
      'Serious misconduct, including but not limited to harassment, stalking, threats, intimidation, physical violence, theft, vandalism, illegal activities, or behaviour that endangers the safety of others, may result in immediate permanent banning without prior warning or refund.',
    ],
  },
  {
    title: 'Hygiene & Cleanliness',
    items: [
      'Members and visitors are expected to maintain proper personal hygiene while using the facilities.',
      'Please wipe down equipment after use where applicable.',
      'The Company reserves the right to refuse entry to individuals whose hygiene, attire, or behaviour negatively affects the comfort, safety, or experience of others.',
    ],
  },
  {
    title: 'Capacity & Access Control',
    items: [
      'The Company reserves the right to limit entry, restrict walk-in access, implement waiting periods, or refuse entry during peak hours, special events, maintenance periods, or overcrowded conditions for safety and operational reasons.',
    ],
  },
  {
    title: 'Lost & Found',
    items: [
      'Any lost and found items retained by the Company for more than 7 days without claim may be disposed of at the Company\u2019s discretion.',
      'The Company shall not be held liable for any unclaimed, lost, or stolen items.',
    ],
  },
  {
    title: 'Data Access Rights',
    items: [
      'You may request access to or correction of your personal data held by the Company by contacting the Company through its official communication channels.',
      'The Company reserves the right to retain personal data for operational, legal, safety, security, and record-keeping purposes in accordance with applicable laws and regulations.',
    ],
  },
  {
    title: 'Final Rights',
    items: [
      'The Company reserves the right to amend, modify, or update these Terms & Conditions at any time without prior notice.',
      'The Company further reserves the right to refuse entry, suspend access, or remove any individual whose conduct is deemed inappropriate, unsafe, disruptive, or inconsistent with the rules and interests of the premises.',
    ],
  },
];
