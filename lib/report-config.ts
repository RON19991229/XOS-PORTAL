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
  required?: boolean;                 // only `what_happened` is required by default
  options?: ReportOption[];           // for radio / select / multiselect
  allowOther?: boolean;               // for multiselect — adds an "other, specify" text box
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
    label: { en: 'Date', zh: '日期', ms: 'Tarikh' },
  },
  {
    qid: 'incident_time',
    group: 'incident',
    type: 'time',
    label: { en: 'Time (approx)', zh: '大约时间', ms: 'Masa (anggaran)' },
  },
  {
    qid: QID.location,
    group: 'incident',
    type: 'multiselect',
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
    type: 'text',
    label: { en: 'Approx. height', zh: '大约身高', ms: 'Anggaran tinggi' },
    placeholder: { en: 'e.g. tall / around 175cm', zh: '例：偏高 / 约175cm', ms: 'cth: tinggi / sekitar 175cm' },
  },
  {
    qid: 'person_shirt',
    group: 'person',
    type: 'select',
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
    allowOther: true,
    label: { en: 'Race / ethnicity (if known)', zh: '种族／族裔（如知道）', ms: 'Bangsa / etnik (jika tahu)' },
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
    ],
  },
  {
    qid: 'person_details',
    group: 'person',
    type: 'textarea',
    label: { en: 'Other identifying details', zh: '其他辨识特征', ms: 'Ciri pengenalan lain' },
    hint: {
      en: 'Hairstyle, tattoos, glasses, body build, etc.',
      zh: '发型、纹身、眼镜、体型等。',
      ms: 'Gaya rambut, tatu, cermin mata, bentuk badan, dll.',
    },
  },

  // ---- GROUP: followup -----------------------------------------------------
  {
    qid: 'witnesses',
    group: 'followup',
    type: 'radio',
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
  },
  {
    qid: 'happened_before',
    group: 'followup',
    type: 'radio',
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
  heroReassure: string;
  trust: string;
  // section kickers
  firstKick: string;
  personKick: string;
  contactKick: string;
  // person / photo
  addPhoto: string;
  photoCap: string;
  photoChosen: string;
  removePhoto: string;
  photoTooLarge: string;
  // multiselect other
  otherLabel: string;
  otherPlaceholder: string;
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
    heroQ: 'Feels unsafe? Feels uncomfortable?',
    heroHelp: 'We are always here to help.',
    heroReassure:
      'If something happened at X FITNESS that made you feel unsafe or uncomfortable, please tell us. We take every report seriously.',
    trust: '100% CONFIDENTIAL \u00b7 SEEN BY OUR MANAGEMENT ONLY',
    firstKick: '// FIRST, LET US KNOW WHAT HAPPENED TO YOU',
    personKick: 'Description of the person involved',
    contactKick: '// YOUR DETAILS (100% OPTIONAL)',
    addPhoto: 'Add a photo of the person / scene',
    photoCap: 'Tap to add a photo',
    photoChosen: 'Photo added',
    removePhoto: 'Remove',
    photoTooLarge: 'That image is too large. Please choose one under 12 MB.',
    otherLabel: 'Other',
    otherPlaceholder: 'Other — please specify',
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
    required: 'Please describe what happened before submitting.',
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
    heroQ: '感到不安？感到不舒服？',
    heroHelp: '我们随时在这里帮你。',
    heroReassure:
      '如果你在 X FITNESS 遇到让你感到不安或不舒服的事，请告诉我们。每一份举报我们都会认真对待。',
    trust: '100% 保密 \u00b7 仅本店管理层可查看',
    firstKick: '// 首先，告诉我们发生了什么',
    personKick: '涉事人员描述',
    contactKick: '// 你的资料（完全选填）',
    addPhoto: '上传对方／现场的照片',
    photoCap: '点击添加照片',
    photoChosen: '照片已添加',
    removePhoto: '移除',
    photoTooLarge: '图片太大了，请选择小于 12 MB 的图片。',
    otherLabel: '其他',
    otherPlaceholder: '其他 —— 请填写',
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
    required: '提交前请先描述发生了什么事。',
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
    heroQ: 'Rasa tidak selamat? Rasa tidak selesa?',
    heroHelp: 'Kami sentiasa di sini untuk membantu.',
    heroReassure:
      'Jika sesuatu berlaku di X FITNESS yang membuat anda rasa tidak selamat atau tidak selesa, sila beritahu kami. Setiap laporan kami ambil serius.',
    trust: '100% SULIT \u00b7 DILIHAT OLEH PENGURUSAN KAMI SAHAJA',
    firstKick: '// PERTAMA, BERITAHU KAMI APA YANG BERLAKU',
    personKick: 'Ciri-ciri orang yang terlibat',
    contactKick: '// MAKLUMAT ANDA (PILIHAN SEPENUHNYA)',
    addPhoto: 'Tambah foto orang / tempat kejadian',
    photoCap: 'Ketik untuk tambah foto',
    photoChosen: 'Foto ditambah',
    removePhoto: 'Buang',
    photoTooLarge: 'Imej itu terlalu besar. Sila pilih yang bawah 12 MB.',
    otherLabel: 'Lain-lain',
    otherPlaceholder: 'Lain-lain — sila nyatakan',
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
    required: 'Sila terangkan apa yang berlaku sebelum menghantar.',
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
