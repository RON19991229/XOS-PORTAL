// ===========================================================================
// X FITNESS — Complaint / Harassment Report — CONFIGURATION (v2.10)
// ---------------------------------------------------------------------------
// THIS IS THE ONE FILE RON EDITS TO ADD / REMOVE / REORDER QUESTIONS.
//
// The public report form (/report/form) renders itself entirely from
// `reportFields` below, and every answer is stored self-describing in the
// `incident_reports.answers` JSONB column as:
//     { qid, label, type, value }
// Because answers carry their own English label, the dashboard can render
// any question — including ones added later — with ZERO database migration
// and ZERO dashboard code change. Old reports keep rendering even if you
// later delete a question here.
//
// HOW TO ADD A QUESTION:
//   1. Add an entry to `reportFields` (pick a unique `qid`, a `group`, a
//      `type`, and fill all three languages in `label`).
//   2. That's it. Deploy the frontend. No SQL needed.
//
// HOW TO REMOVE A QUESTION:  delete its entry. Existing reports are unaffected.
//
// Notes:
//   • Location labels intentionally show English for BOTH `en` and `ms`
//     (per Ron — local Malay members read English fine; hard translation
//     reads worse). Chinese `zh` shows the Chinese zone name.
//   • Option `value` is the CANONICAL ENGLISH string that gets stored, so the
//     English-only dashboard always shows English regardless of the language
//     the member filled the form in. Free-text answers are stored as typed.
//   • The photo uploader is NOT a config field (it's a file upload); it is
//     rendered by the form at the end of the `person` group.
// ===========================================================================

import { Lang } from './i18n';

// ---------------------------------------------------------------------------
// Official WhatsApp — one-tap chat with management (shown on all /report
// pages). Change the number here if it ever changes.
// ---------------------------------------------------------------------------
export const WHATSAPP_URL = 'https://wa.me/601172603994';

type L = Record<Lang, string>;

export type ReportFieldType =
  | 'text'
  | 'tel'
  | 'textarea'
  | 'date'
  | 'time'
  | 'radio'
  | 'select'
  | 'multiselect';

export interface ReportOption {
  value: string; // canonical English — this is what gets stored
  label: L;      // what the member sees, per language
}

export interface ReportField {
  qid: string;                        // unique, stable id (also stored on the answer)
  group: 'incident' | 'person' | 'followup' | 'contact';
  type: ReportFieldType;
  label: L;
  hint?: L;
  placeholder?: L;
  required?: boolean;                 // v2.14: most questions are now required
  options?: ReportOption[];           // for radio / select / multiselect
  allowOther?: boolean;               // for multiselect — adds an "other, specify" text box
  requireOtherText?: boolean;         // if answer is "Other", the specify box becomes required
  // v2.14: conditional follow-up text input, shown when the answer equals `value`
  // (e.g. witnesses = Yes → "Who saw it?"). Stored in the answer's `other` field.
  followUp?: {
    value: string;                    // show the input when the answer equals this
    placeholder: L;
    required?: boolean;               // block submit if shown but left empty
  };
}

// Well-known qids the form & dashboard treat specially (kept as columns too).
export const QID = {
  whatHappened: 'what_happened',
  reporterName: 'reporter_name',
  reporterContact: 'reporter_contact',
  remainAnonymous: 'remain_anonymous',
  location: 'location',
  urgency: 'urgency',
} as const;

// ---------------------------------------------------------------------------
// THE QUESTIONS
// ---------------------------------------------------------------------------
export const reportFields: ReportField[] = [
  // ---- GROUP: incident -----------------------------------------------------
  {
    qid: QID.urgency,
    group: 'incident',
    type: 'radio',
    required: true,
    label: {
      en: 'Is this still happening — are you safe right now?',
      zh: '事情还在发生吗 —— 你现在安全吗？',
      ms: 'Adakah ini masih berlaku — adakah anda selamat sekarang?',
    },
    options: [
      {
        value: 'Happening now',
        label: {
          en: 'Happening now / I feel unsafe right now',
          zh: '正在发生／我现在感到不安',
          ms: 'Sedang berlaku / saya rasa tidak selamat sekarang',
        },
      },
      {
        value: 'Earlier today',
        label: { en: 'Earlier today', zh: '今天稍早', ms: 'Awal hari ini' },
      },
      {
        value: 'In the past',
        label: { en: 'In the past', zh: '以前发生的', ms: 'Pada masa lalu' },
      },
    ],
  },
  {
    qid: QID.whatHappened,
    group: 'incident',
    type: 'textarea',
    required: true,
    label: { en: 'What happened?', zh: '发生了什么事？', ms: 'Apa yang berlaku?' },
    hint: {
      en: 'Tell us in your own words — as much or as little as you feel comfortable sharing.',
      zh: '用你自己的话告诉我们 —— 写多写少都可以，以你觉得自在为准。',
      ms: 'Ceritakan dengan kata-kata anda sendiri — sebanyak atau sesedikit yang anda selesa kongsi.',
    },
  },
  {
    qid: 'incident_date',
    group: 'incident',
    type: 'date',
    required: true,
    label: { en: 'Date', zh: '日期', ms: 'Tarikh' },
  },
  {
    qid: 'incident_time',
    group: 'incident',
    type: 'time',
    required: true,
    label: { en: 'Time (approx)', zh: '大约时间', ms: 'Masa (anggaran)' },
  },
  {
    qid: QID.location,
    group: 'incident',
    type: 'multiselect',
    required: true,
    allowOther: true,
    label: { en: 'Where did it happen?', zh: '事发地点？', ms: 'Di mana ia berlaku?' },
    hint: {
      en: 'You can choose more than one.',
      zh: '可多选。',
      ms: 'Anda boleh pilih lebih daripada satu.',
    },
    options: [
      { value: 'Dumbbell Area',                 label: { en: 'Dumbbell Area',                 zh: '哑铃区',                    ms: 'Dumbbell Area' } },
      { value: 'Squat Area',                    label: { en: 'Squat Area',                    zh: '深蹲区',                    ms: 'Squat Area' } },
      { value: 'Cardio Area (treadmills)',      label: { en: 'Cardio Area (treadmills)',      zh: '有氧区（跑步机）',           ms: 'Cardio Area (treadmills)' } },
      { value: 'Functional Area',               label: { en: 'Functional Area',               zh: '拉伸区',                    ms: 'Functional Area' } },
      { value: 'Leg Area (2F)',                 label: { en: 'Leg Area (2F)',                 zh: '练腿区（2楼）',              ms: 'Leg Area (2F)' } },
      { value: '2F Front Machines (by the TV)', label: { en: '2F Front Machines (by the TV)', zh: '2楼前面器械区（电视机前面）', ms: '2F Front Machines (by the TV)' } },
      { value: '2F Middle Machines',            label: { en: '2F Middle Machines',            zh: '2楼中间器械区',             ms: '2F Middle Machines' } },
      { value: '2F Back Machines (window row)', label: { en: '2F Back Machines (window row)', zh: '2楼后方器械区（靠玻璃窗那排）', ms: '2F Back Machines (window row)' } },
    ],
  },

  // ---- GROUP: person -------------------------------------------------------
  {
    qid: 'person_role',
    group: 'person',
    type: 'radio',
    required: true,
    label: {
      en: 'Who is this person?',
      zh: '这个人是什么身份？',
      ms: 'Siapakah orang ini?',
    },
    options: [
      { value: 'Another member', label: { en: 'Another member', zh: '其他会员', ms: 'Ahli lain' } },
      { value: 'Staff',          label: { en: 'Staff',          zh: '员工',     ms: 'Kakitangan' } },
      { value: 'Personal trainer', label: { en: 'Personal trainer', zh: '私人教练', ms: 'Jurulatih peribadi' } },
      { value: 'Not sure',       label: { en: 'Not sure',       zh: '不清楚',   ms: 'Tidak pasti' } },
    ],
  },
  {
    qid: 'person_gender',
    group: 'person',
    type: 'radio',
    required: true,
    label: { en: 'Gender', zh: '性别', ms: 'Jantina' },
    options: [
      { value: 'Male',     label: { en: 'Male',     zh: '男',     ms: 'Lelaki' } },
      { value: 'Female',   label: { en: 'Female',   zh: '女',     ms: 'Perempuan' } },
      { value: 'Not sure', label: { en: 'Not sure', zh: '不确定', ms: 'Tidak pasti' } },
    ],
  },
  {
    qid: 'person_height',
    group: 'person',
    type: 'select',
    required: true,
    label: { en: 'Approx. height', zh: '大约身高', ms: 'Anggaran tinggi' },
    options: [
      { value: 'Below 150cm', label: { en: 'Below 150cm', zh: '150cm 以下', ms: 'Bawah 150cm' } },
      { value: '150–155cm',   label: { en: '150–155cm',   zh: '150–155cm',  ms: '150–155cm' } },
      { value: '155–160cm',   label: { en: '155–160cm',   zh: '155–160cm',  ms: '155–160cm' } },
      { value: '160–165cm',   label: { en: '160–165cm',   zh: '160–165cm',  ms: '160–165cm' } },
      { value: '165–170cm',   label: { en: '165–170cm',   zh: '165–170cm',  ms: '165–170cm' } },
      { value: '170–175cm',   label: { en: '170–175cm',   zh: '170–175cm',  ms: '170–175cm' } },
      { value: '175–180cm',   label: { en: '175–180cm',   zh: '175–180cm',  ms: '175–180cm' } },
      { value: '180–185cm',   label: { en: '180–185cm',   zh: '180–185cm',  ms: '180–185cm' } },
      { value: 'Above 185cm', label: { en: 'Above 185cm', zh: '185cm 以上', ms: 'Atas 185cm' } },
      { value: 'Not sure',    label: { en: 'Not sure',    zh: '不确定',     ms: 'Tidak pasti' } },
    ],
  },
  {
    qid: 'person_shirt',
    group: 'person',
    type: 'select',
    required: true,
    allowOther: true,
    label: { en: 'Shirt colour', zh: '上衣颜色', ms: 'Warna baju' },
    options: [
      { value: 'Black',  label: { en: 'Black',  zh: '黑色', ms: 'Hitam' } },
      { value: 'White',  label: { en: 'White',  zh: '白色', ms: 'Putih' } },
      { value: 'Grey',   label: { en: 'Grey',   zh: '灰色', ms: 'Kelabu' } },
      { value: 'Red',    label: { en: 'Red',    zh: '红色', ms: 'Merah' } },
      { value: 'Blue',   label: { en: 'Blue',   zh: '蓝色', ms: 'Biru' } },
      { value: 'Green',  label: { en: 'Green',  zh: '绿色', ms: 'Hijau' } },
      { value: 'Yellow', label: { en: 'Yellow', zh: '黄色', ms: 'Kuning' } },
      { value: 'Other',  label: { en: 'Other',  zh: '其他', ms: 'Lain-lain' } },
    ],
  },
  {
    qid: 'person_race',
    group: 'person',
    type: 'select',
    required: true,
    allowOther: true,
    requireOtherText: true, // choosing "Other" must be accompanied by a description
    label: { en: 'Race / ethnicity', zh: '种族／族裔', ms: 'Bangsa / etnik' },
    options: [
      { value: 'Chinese', label: { en: 'Chinese', zh: '华裔', ms: 'Cina' } },
      { value: 'Indian',  label: { en: 'Indian',  zh: '印裔', ms: 'India' } },
      { value: 'Malay',   label: { en: 'Malay',   zh: '巫裔', ms: 'Melayu' } },
      { value: 'Other',   label: { en: 'Other',   zh: '其他', ms: 'Lain-lain' } },
    ],
  },
  {
    qid: 'person_usual_time',
    group: 'person',
    type: 'multiselect',
    required: true,
    label: {
      en: 'When does this person usually come?',
      zh: '这个人通常什么时候来？',
      ms: 'Bilakah orang ini biasanya datang?',
    },
    hint: {
      en: 'This helps us identify them from CCTV. Choose any that apply.',
      zh: '这有助于我们从闭路电视辨认对方。可多选。',
      ms: 'Ini membantu kami mengenal pasti mereka dari CCTV. Pilih yang berkenaan.',
    },
    options: [
      { value: 'Morning',   label: { en: 'Morning',   zh: '早上',   ms: 'Pagi' } },
      { value: 'Afternoon', label: { en: 'Afternoon', zh: '下午',   ms: 'Tengah hari' } },
      { value: 'Evening',   label: { en: 'Evening',   zh: '晚上',   ms: 'Malam' } },
      { value: 'Weekends',  label: { en: 'Weekends',  zh: '周末',   ms: 'Hujung minggu' } },
      { value: 'Not sure',  label: { en: 'Not sure',  zh: '不确定', ms: 'Tidak pasti' } },
    ],
  },
  // ---- identifying details, structured (v2.14 — split from the old
  //      "Other identifying details" textarea; all optional) ---------------
  {
    qid: 'person_hair_color',
    group: 'person',
    type: 'select',
    allowOther: true,
    label: { en: 'Hair colour', zh: '头发颜色', ms: 'Warna rambut' },
    options: [
      { value: 'Black',                label: { en: 'Black',                zh: '黑色',           ms: 'Hitam' } },
      { value: 'Brown',                label: { en: 'Brown',                zh: '棕色',           ms: 'Coklat' } },
      { value: 'Blonde',               label: { en: 'Blonde',               zh: '金色',           ms: 'Perang' } },
      { value: 'Dyed (bright colour)', label: { en: 'Dyed (bright colour)', zh: '染发（鲜艳颜色）', ms: 'Diwarnakan (warna terang)' } },
      { value: 'Grey / White',         label: { en: 'Grey / White',         zh: '灰白',           ms: 'Kelabu / Putih' } },
      { value: 'Other',                label: { en: 'Other',                zh: '其他',           ms: 'Lain-lain' } },
      { value: 'Not sure',             label: { en: 'Not sure',             zh: '不确定',         ms: 'Tidak pasti' } },
    ],
  },
  {
    qid: 'person_hair_length',
    group: 'person',
    type: 'select',
    label: { en: 'Hair length / style', zh: '发量／发型', ms: 'Panjang / gaya rambut' },
    options: [
      { value: 'Long',                  label: { en: 'Long',                  zh: '长发',             ms: 'Panjang' } },
      { value: 'Medium',                label: { en: 'Medium',                zh: '中长',             ms: 'Sederhana' } },
      { value: 'Short',                 label: { en: 'Short',                 zh: '短发',             ms: 'Pendek' } },
      { value: 'Very short / buzz cut', label: { en: 'Very short / buzz cut', zh: '很短／寸头',       ms: 'Sangat pendek / botak sikit' } },
      { value: 'Bald / shaved',         label: { en: 'Bald / shaved',         zh: '光头／剃光',       ms: 'Botak' } },
      { value: 'Not sure',              label: { en: 'Not sure',              zh: '不确定',           ms: 'Tidak pasti' } },
    ],
  },
  {
    qid: 'person_tattoo',
    group: 'person',
    type: 'radio',
    label: { en: 'Do they have a tattoo?', zh: '有纹身吗？', ms: 'Ada tatu?' },
    options: [
      { value: 'Yes',      label: { en: 'Yes',      zh: '有',     ms: 'Ya' } },
      { value: 'No',       label: { en: 'No',       zh: '没有',   ms: 'Tidak' } },
      { value: 'Not sure', label: { en: 'Not sure', zh: '不确定', ms: 'Tidak pasti' } },
    ],
    followUp: {
      value: 'Yes',
      required: true,
      placeholder: {
        en: 'Where is the tattoo? e.g. left arm, neck…',
        zh: '纹身在哪里？例：左手臂、颈部…',
        ms: 'Di mana tatu itu? cth: lengan kiri, leher…',
      },
    },
  },
  {
    qid: 'person_glasses',
    group: 'person',
    type: 'radio',
    label: { en: 'Were they wearing glasses?', zh: '有戴眼镜吗？', ms: 'Adakah mereka memakai cermin mata?' },
    options: [
      { value: 'Yes',      label: { en: 'Yes',      zh: '有',     ms: 'Ya' } },
      { value: 'No',       label: { en: 'No',       zh: '没有',   ms: 'Tidak' } },
      { value: 'Not sure', label: { en: 'Not sure', zh: '不确定', ms: 'Tidak pasti' } },
    ],
  },
  {
    qid: 'person_build',
    group: 'person',
    type: 'select',
    label: { en: 'Body build', zh: '体型', ms: 'Bentuk badan' },
    options: [
      { value: 'Slim',                 label: { en: 'Slim',                 zh: '偏瘦',       ms: 'Kurus' } },
      { value: 'Average',              label: { en: 'Average',              zh: '中等',       ms: 'Sederhana' } },
      { value: 'Athletic / muscular',  label: { en: 'Athletic / muscular',  zh: '健壮／有肌肉', ms: 'Sasa / berotot' } },
      { value: 'Heavy / large',        label: { en: 'Heavy / large',        zh: '偏胖／魁梧',  ms: 'Berbadan besar' } },
      { value: 'Not sure',             label: { en: 'Not sure',             zh: '不确定',     ms: 'Tidak pasti' } },
    ],
  },
  {
    qid: 'person_details',
    group: 'person',
    type: 'textarea',
    label: { en: 'Other identifying details', zh: '其他辨识特征', ms: 'Ciri pengenalan lain' },
    hint: {
      en: 'Anything else that could help us recognise them — beard, cap, bag, accent, etc.',
      zh: '任何有助于我们辨认对方的特征 —— 胡子、帽子、背包、口音等。',
      ms: 'Apa-apa lagi yang boleh membantu kami mengenali mereka — janggut, topi, beg, loghat, dll.',
    },
  },

  // ---- GROUP: followup -----------------------------------------------------
  {
    qid: 'witnesses',
    group: 'followup',
    type: 'radio',
    required: true,
    label: {
      en: 'Did anyone else see it happen?',
      zh: '当时有其他人看到吗？',
      ms: 'Adakah orang lain nampak kejadian itu?',
    },
    options: [
      { value: 'Yes',      label: { en: 'Yes',      zh: '有',     ms: 'Ya' } },
      { value: 'No',       label: { en: 'No',       zh: '没有',   ms: 'Tidak' } },
      { value: 'Not sure', label: { en: 'Not sure', zh: '不确定', ms: 'Tidak pasti' } },
    ],
    followUp: {
      value: 'Yes',
      required: true,
      placeholder: {
        en: 'Who saw it? e.g. my friend, another member, a staff member…',
        zh: '是谁看到的？例：我的朋友、其他会员、某位职员…',
        ms: 'Siapa yang nampak? cth: kawan saya, ahli lain, staf…',
      },
    },
  },
  {
    qid: 'happened_before',
    group: 'followup',
    type: 'radio',
    required: true,
    label: { en: 'Has this happened before?', zh: '以前是否发生过？', ms: 'Adakah ini pernah berlaku?' },
    options: [
      { value: 'Yes',      label: { en: 'Yes',      zh: '是',     ms: 'Ya' } },
      { value: 'No',       label: { en: 'No',       zh: '否',     ms: 'Tidak' } },
      { value: 'Not sure', label: { en: 'Not sure', zh: '不确定', ms: 'Tidak pasti' } },
    ],
  },
  {
    qid: 'speak_to_person',
    group: 'followup',
    type: 'select',
    required: true,
    label: {
      en: 'Would you like us to speak to this person?',
      zh: '你希望我们与此人沟通吗？',
      ms: 'Adakah anda mahu kami berbincang dengan orang ini?',
    },
    options: [
      { value: 'Yes',                                        label: { en: 'Yes', zh: '是', ms: 'Ya' } },
      { value: 'No',                                         label: { en: 'No',  zh: '否', ms: 'Tidak' } },
      { value: 'Let management decide after investigation',  label: { en: 'Let management decide after investigation', zh: '由管理层调查后决定', ms: 'Biar pengurusan tentukan selepas siasatan' } },
    ],
  },
  {
    qid: QID.remainAnonymous,
    group: 'followup',
    type: 'radio',
    required: true,
    label: { en: 'Would you like to remain anonymous?', zh: '你希望保持匿名吗？', ms: 'Adakah anda mahu kekal tanpa nama?' },
    options: [
      { value: 'Yes', label: { en: 'Yes', zh: '是', ms: 'Ya' } },
      { value: 'No',  label: { en: 'No',  zh: '否', ms: 'Tidak' } },
    ],
  },

  // ---- GROUP: contact (all optional) --------------------------------------
  {
    qid: QID.reporterName,
    group: 'contact',
    type: 'text',
    label: { en: 'Your name', zh: '你的姓名', ms: 'Nama anda' },
    hint: {
      en: "Leave blank to stay anonymous — that's completely okay.",
      zh: '可留空以保持匿名 —— 完全没问题。',
      ms: 'Biarkan kosong untuk kekal tanpa nama — tiada masalah.',
    },
    placeholder: { en: 'Your name', zh: '你的姓名', ms: 'Nama anda' },
  },
  {
    qid: QID.reporterContact,
    group: 'contact',
    type: 'tel',
    label: { en: 'Contact number', zh: '联络电话', ms: 'Nombor telefon' },
    hint: {
      en: "Only if you'd like us to update you on the outcome.",
      zh: '如希望我们通知你调查结果再填写。',
      ms: 'Hanya jika anda mahu kami maklumkan keputusan.',
    },
    placeholder: { en: '01X-XXXXXXX', zh: '01X-XXXXXXX', ms: '01X-XXXXXXX' },
  },
  {
    qid: 'anything_else',
    group: 'contact',
    type: 'textarea',
    label: {
      en: 'Anything else you\u2019d like us to know?',
      zh: '还有其他想让我们知道的吗？',
      ms: 'Ada apa-apa lagi yang anda mahu kami tahu?',
    },
  },
];

// ---------------------------------------------------------------------------
// STATIC COPY (hero, section headers, notice, success screen, buttons).
// Also trilingual. Edit freely — these are not stored, just displayed.
// ---------------------------------------------------------------------------
export interface ReportCopy {
  // language landing
  landingLine: string;
  chooseLanguage: string;
  // header
  optional: string;
  // hero
  heroQ: string;
  heroHelp: string;
  /** v2.16 — elegant quote line under the highlight (replaces the reassure paragraph) */
  heroQuote: string;
  trust: string;
  // section cards (numbered 1-4 on the warm-white form)
  sec1: string;
  sec2: string;
  sec3: string;
  sec4: string;
  secRequired: string;      // small tag on cards 1–3 (v2.14: most questions required)
  secFullyOptional: string; // small tag on card 4
  // WhatsApp — one-tap chat with management
  waTalkTitle: string;      // landing card title
  waTalkSub: string;        // landing card subtitle
  waChat: string;           // small CHAT button
  waRatherTitle: string;    // form-bottom card title
  waRatherSub: string;      // form-bottom card subtitle
  waUrgentBtn: string;      // button inside the "happening now" callout
  waUrgentPrefill: string;  // prefilled WhatsApp message (urgent)
  waFollowTitle: string;    // success-screen card title
  waFollowSub: string;      // success-screen card subtitle
  waFollowBtn: string;      // success-screen button (ref code appended)
  waFollowPrefill: string;  // prefilled follow-up message; {ref} = reference no.
  // person / photo
  addPhoto: string;
  photoEncourage: string;   // v2.14: encourage upload + PDPA reassurance
  photoCap: string;
  photoChosen: string;
  removePhoto: string;
  photoTooLarge: string;
  // multiselect other
  otherLabel: string;
  otherPlaceholder: string;
  // PDRM card (shown above the notice; also deters joke reports)
  policeH: string;
  policeNote: string;
  // notice
  noticeH: string;
  notice: string[];
  // buttons / states
  submit: string;
  submitSub: string;
  submitting: string;
  required: string; // shown when required field empty
  errorGeneric: string;
  cooldown: string;
  // urgent safety callout (shown when urgency = "Happening now")
  urgentNow: string;
  // data-use / PDPA notice on the form
  pdpa: string;
  // success screen reference number
  refLabel: string;
  refScreenshot: string;
  refFollowUp: string;
  // success
  okTitle: string;
  okMsg: string;
  stepsTitle: string;
  steps: { h: string; p: string }[];
  okFoot: string; // may contain <b> around the reception phrase
  back: string;
}

export const reportCopy: Record<Lang, ReportCopy> = {
  en: {
    landingLine:
      'Feel unsafe or uncomfortable at X FITNESS? Let us know — every report is confidential and taken seriously.',
    chooseLanguage: 'Choose your language',
    optional: 'optional',
    heroQ: 'Feeling unsafe or uncomfortable?',
    heroHelp: "IT'S OKAY TO SPEAK UP.",
    heroQuote: "DON'T WORRY. WE'RE HERE TO HELP.",
    trust: '100% CONFIDENTIAL \u00b7 MANAGEMENT ONLY',
    sec1: 'WHAT HAPPENED TO YOU',
    sec2: 'THE PERSON INVOLVED',
    sec3: 'A FEW MORE THINGS',
    sec4: 'YOUR DETAILS',
    secRequired: '* REQUIRED',
    secFullyOptional: '100% OPTIONAL',
    waTalkTitle: 'Prefer to talk to a person?',
    waTalkSub: 'WhatsApp our management directly.',
    waChat: 'CHAT',
    waRatherTitle: 'Rather talk it through?',
    waRatherSub: 'You can WhatsApp management instead of using this form.',
    waUrgentBtn: 'WHATSAPP US NOW',
    waUrgentPrefill: 'URGENT - I need help at X FITNESS right now',
    waFollowTitle: 'Want to follow up on WhatsApp?',
    waFollowSub: 'Message us with your reference number — we will pick it up from there.',
    waFollowBtn: 'WHATSAPP US',
    waFollowPrefill: 'Hi X FITNESS, I would like to follow up on my report {ref}',
    addPhoto: 'Add a photo of the person / scene',
    photoEncourage:
      'A photo helps our investigation a lot — even a blurry one. It will be used only to investigate this report and handled in line with the Malaysian PDPA.',
    photoCap: 'Tap to add a photo',
    photoChosen: 'Photo added',
    removePhoto: 'Remove',
    photoTooLarge: 'That image is too large. Please choose one under 12 MB.',
    otherLabel: 'Other',
    otherPlaceholder: 'Other — please specify',
    policeH: 'This is an official report',
    policeNote:
      'If necessary, this report can be printed for you to lodge a police report with the Royal Malaysia Police (PDRM). Please make sure everything you submit is true and accurate.',
    noticeH: 'How we handle your report',
    notice: [
      'Seen only by X FITNESS management — kept confidential.',
      'Anonymous reports are welcome; contact details just help us follow up.',
      "We investigate fairly — we can't act on a report alone, so we gather evidence first.",
      'If you feel unsafe right now, please go to reception or any staff immediately.',
    ],
    submit: 'SUBMIT CONFIDENTIALLY',
    submitSub: 'Your report goes straight to management. Thank you for speaking up.',
    submitting: 'SENDING…',
    required: 'Please answer all required questions marked with * before submitting.',
    errorGeneric: 'Sorry, something went wrong. Please try again in a moment.',
    cooldown: 'You just submitted a report. Please wait a moment before sending another.',
    urgentNow:
      'If you are in immediate danger or this is happening right now, please go to our reception counter or approach any staff member immediately — you don\u2019t have to finish this form first.',
    pdpa: 'The details you provide are used only to investigate this report and are kept confidential by X FITNESS management, in line with the Malaysian PDPA.',
    refLabel: 'YOUR REFERENCE NUMBER',
    refScreenshot: 'Please screenshot this to follow up later',
    refFollowUp: 'If you\u2019d like to follow up at reception, just show this number.',
    okTitle: "Thank you. We've received your report.",
    okMsg:
      'Your report has reached X FITNESS management directly and confidentially. We take this seriously and will look into it carefully. Please know that we cannot take action against anyone based on a report alone — to be fair to everyone, we need time to review CCTV and gather evidence. If you left your contact details, we will update you once we have an outcome.',
    stepsTitle: '// WHAT HAPPENS NEXT',
    steps: [
      { h: 'Received', p: 'Your report just reached management — confidentially.' },
      { h: 'Reviewed', p: 'Management reads your report personally.' },
      { h: 'Investigation', p: 'We review CCTV and gather evidence fairly. This takes time.' },
      { h: 'We update you', p: 'If you left your contact, we will share the outcome with you.' },
    ],
    okFoot:
      'You are not alone. If you ever feel unsafe at X FITNESS, please approach our <b>reception counter</b> or any staff member immediately.',
    back: 'Back',
  },
  zh: {
    landingLine:
      '在 X FITNESS 感到不安或不舒服？告诉我们 —— 每一份举报都会保密处理并认真对待。',
    chooseLanguage: '请选择语言',
    optional: '选填',
    heroQ: '感到不舒服或受到骚扰？',
    heroHelp: '勇敢告诉我们。',
    heroQuote: '别担心，我们会帮助你。',
    trust: '100% 保密 \u00b7 仅管理层可查看',
    sec1: '发生了什么事',
    sec2: '涉事人员',
    sec3: '再补充几点',
    sec4: '你的资料',
    secRequired: '* 必填',
    secFullyOptional: '完全选填',
    waTalkTitle: '想直接跟真人聊？',
    waTalkSub: '直接 WhatsApp 我们的管理层。',
    waChat: '联系',
    waRatherTitle: '更想用聊的方式说？',
    waRatherSub: '你也可以不填表单，直接 WhatsApp 管理层。',
    waUrgentBtn: '立即 WHATSAPP 我们',
    waUrgentPrefill: '紧急 - 我现在在 X FITNESS 需要帮助',
    waFollowTitle: '想通过 WhatsApp 跟进？',
    waFollowSub: '发消息时附上你的参考编号，我们会接手处理。',
    waFollowBtn: 'WHATSAPP 我们',
    waFollowPrefill: '你好 X FITNESS，我想跟进我的举报 {ref}',
    addPhoto: '上传对方／现场的照片',
    photoEncourage:
      '照片对我们的调查帮助很大 —— 就算拍得模糊也没关系。照片仅用于调查此举报，并按马来西亚个人资料保护法（PDPA）处理。',
    photoCap: '点击添加照片',
    photoChosen: '照片已添加',
    removePhoto: '移除',
    photoTooLarge: '图片太大了，请选择小于 12 MB 的图片。',
    otherLabel: '其他',
    otherPlaceholder: '其他 —— 请填写',
    policeH: '这是一份正式举报',
    policeNote:
      '如有必要，此举报可以列印出来，供你向马来西亚皇家警察（PDRM）报案使用。请确保你提交的内容全部属实、准确。',
    noticeH: '我们如何处理你的举报',
    notice: [
      '仅 X FITNESS 管理层可查看 —— 保密处理。',
      '欢迎匿名举报；留下联络方式只是方便我们跟进。',
      '我们会公平调查 —— 不能仅凭一份举报就采取行动，因此需要先收集证据。',
      '如果你现在感到不安，请立即前往前台或联系任何职员。',
    ],
    submit: '保密提交',
    submitSub: '你的举报会直接送到管理层。谢谢你愿意说出来。',
    submitting: '提交中…',
    required: '提交前，请先回答所有标有 * 的必填题。',
    errorGeneric: '抱歉，出了点问题。请稍后再试一次。',
    cooldown: '你刚刚提交过举报，请稍等片刻再提交下一份。',
    urgentNow:
      '如果你现在有立即危险、或事情正在发生，请马上前往前台柜台或联系任何职员 —— 不必先填完这份表单。',
    pdpa: '你提供的资料仅用于调查此举报，并由 X FITNESS 管理层保密处理，符合马来西亚个人资料保护法（PDPA）。',
    refLabel: '你的参考编号',
    refScreenshot: '请截图保存，以便日后跟进',
    refFollowUp: '如需到前台跟进，出示此编号即可。',
    okTitle: '谢谢你，我们已经收到你的举报。',
    okMsg:
      '你的举报已直接、保密地送到 X FITNESS 管理层。我们高度重视，会认真调查。请理解，我们不能仅凭一份举报就对任何人采取行动 —— 为了对每个人公平，我们需要时间调阅闭路电视、收集证据。如果你留下了联络方式，我们会在有结果后通知你。',
    stepsTitle: '// 接下来会发生什么',
    steps: [
      { h: '已收到', p: '你的举报已保密送达管理层。' },
      { h: '已阅读', p: '管理层会亲自查看你的举报。' },
      { h: '调查取证', p: '我们会调阅闭路电视、公平收集证据，这需要一些时间。' },
      { h: '通知你结果', p: '如果你留了联络方式，我们会把结果告诉你。' },
    ],
    okFoot:
      '你并不孤单。若你在 X FITNESS 感到不安，请立即前往<b>前台柜台</b>或联系任何职员。',
    back: '返回',
  },
  ms: {
    landingLine:
      'Rasa tidak selamat atau tidak selesa di X FITNESS? Beritahu kami — setiap laporan adalah sulit dan diambil serius.',
    chooseLanguage: 'Pilih bahasa anda',
    optional: 'pilihan',
    heroQ: 'Rasa tidak selamat atau tidak selesa?',
    heroHelp: 'BERANILAH BERSUARA.',
    heroQuote: 'JANGAN RISAU. KAMI SEDIA MEMBANTU.',
    trust: '100% SULIT \u00b7 PENGURUSAN SAHAJA',
    sec1: 'APA YANG BERLAKU',
    sec2: 'ORANG YANG TERLIBAT',
    sec3: 'BEBERAPA PERKARA LAGI',
    sec4: 'MAKLUMAT ANDA',
    secRequired: '* WAJIB',
    secFullyOptional: '100% PILIHAN',
    waTalkTitle: 'Lebih suka bercakap terus?',
    waTalkSub: 'WhatsApp pengurusan kami secara terus.',
    waChat: 'SEMBANG',
    waRatherTitle: 'Lebih selesa berbual?',
    waRatherSub: 'Anda boleh WhatsApp pengurusan tanpa mengisi borang ini.',
    waUrgentBtn: 'WHATSAPP KAMI SEKARANG',
    waUrgentPrefill: 'SEGERA - Saya perlukan bantuan di X FITNESS sekarang',
    waFollowTitle: 'Mahu susulan melalui WhatsApp?',
    waFollowSub: 'Hantar mesej dengan nombor rujukan anda — kami akan uruskan dari situ.',
    waFollowBtn: 'WHATSAPP KAMI',
    waFollowPrefill: 'Hai X FITNESS, saya ingin membuat susulan laporan saya {ref}',
    addPhoto: 'Tambah foto orang / tempat kejadian',
    photoEncourage:
      'Foto sangat membantu siasatan kami — walaupun kabur. Ia hanya digunakan untuk menyiasat laporan ini dan dikendalikan selaras dengan PDPA Malaysia.',
    photoCap: 'Ketik untuk tambah foto',
    photoChosen: 'Foto ditambah',
    removePhoto: 'Buang',
    photoTooLarge: 'Imej itu terlalu besar. Sila pilih yang bawah 12 MB.',
    otherLabel: 'Lain-lain',
    otherPlaceholder: 'Lain-lain — sila nyatakan',
    policeH: 'Ini adalah laporan rasmi',
    policeNote:
      'Jika perlu, laporan ini boleh dicetak untuk anda membuat laporan polis dengan Polis Diraja Malaysia (PDRM). Sila pastikan semua yang anda hantar adalah benar dan tepat.',
    noticeH: 'Bagaimana kami mengendalikan laporan anda',
    notice: [
      'Dilihat oleh pengurusan X FITNESS sahaja — dirahsiakan.',
      'Laporan tanpa nama dialu-alukan; maklumat hubungan hanya membantu susulan.',
      'Kami menyiasat secara adil — tidak boleh bertindak atas satu laporan sahaja, jadi kami kumpul bukti dahulu.',
      'Jika anda rasa tidak selamat sekarang, sila terus ke kaunter atau mana-mana staf.',
    ],
    submit: 'HANTAR SECARA SULIT',
    submitSub: 'Laporan anda terus kepada pengurusan. Terima kasih kerana bersuara.',
    submitting: 'MENGHANTAR…',
    required: 'Sila jawab semua soalan wajib bertanda * sebelum menghantar.',
    errorGeneric: 'Maaf, ada masalah. Sila cuba lagi sebentar nanti.',
    cooldown: 'Anda baru sahaja menghantar laporan. Sila tunggu sebentar sebelum menghantar yang lain.',
    urgentNow:
      'Jika anda dalam bahaya serta-merta atau ini sedang berlaku sekarang, sila terus ke kaunter penerimaan atau dekati mana-mana kakitangan dengan segera \u2014 anda tidak perlu menyiapkan borang ini dahulu.',
    pdpa: 'Maklumat yang anda berikan digunakan hanya untuk menyiasat laporan ini dan dirahsiakan oleh pengurusan X FITNESS, selaras dengan PDPA Malaysia.',
    refLabel: 'NOMBOR RUJUKAN ANDA',
    refScreenshot: 'Sila tangkap skrin untuk susulan kemudian',
    refFollowUp: 'Jika anda mahu membuat susulan di kaunter, tunjukkan sahaja nombor ini.',
    okTitle: 'Terima kasih. Kami telah menerima laporan anda.',
    okMsg:
      'Laporan anda telah sampai terus dan secara sulit kepada pengurusan X FITNESS. Kami memandang serius perkara ini dan akan menyiasat dengan teliti. Sila fahami bahawa kami tidak boleh bertindak terhadap sesiapa hanya berdasarkan satu laporan — untuk berlaku adil kepada semua, kami perlukan masa menyemak CCTV dan mengumpul bukti. Jika anda tinggalkan maklumat hubungan, kami akan maklumkan apabila ada keputusan.',
    stepsTitle: '// APA SETERUSNYA',
    steps: [
      { h: 'Diterima', p: 'Laporan anda baru sampai kepada pengurusan — secara sulit.' },
      { h: 'Dibaca', p: 'Pengurusan membaca laporan anda sendiri.' },
      { h: 'Siasatan', p: 'Kami semak CCTV dan kumpul bukti secara adil. Ini mengambil masa.' },
      { h: 'Kami maklumkan anda', p: 'Jika anda tinggalkan maklumat hubungan, kami kongsi keputusan dengan anda.' },
    ],
    okFoot:
      'Anda tidak keseorangan. Jika anda rasa tidak selamat di X FITNESS, sila terus ke <b>kaunter penerimaan</b> atau mana-mana staf dengan segera.',
    back: 'Kembali',
  },
};

// A stored answer (shape of each element in incident_reports.answers).
export interface StoredAnswer {
  qid: string;
  label: string;              // English label at submission time (self-describing)
  type: ReportFieldType;
  value: string | string[];   // canonical English for options; raw text otherwise
  other?: string;             // free text for multiselect "Other"
}
