// Auto-extracted static data for Maths Study Hub. Loaded before the main script in index.html.
// Edit data here; app logic stays in index.html.
//
// GRADE BOUNDARIES — every figure below is transcribed mechanically from Pearson's own
// published PDFs by scripts/extract-grade-boundaries.py. Nothing here is typed by hand and
// nothing is estimated. Sources (all qualifications.pearson.com):
//   June 2018  1806-a-level-grade-boundaries1.pdf
//   June 2019  1906-gce-notional-grade-boundaries-v1.pdf · gce-subject-grade-boundaries.pdf
//   June 2022  2206-gce-notional-component-grade-boundaries.pdf · 2206-gce-subject-grade-boundaries.pdf
//   June 2023  2306-gce-notional-component-grade-boundaries.pdf · 2306-gce-subject-grade-boundaries.pdf
//   June 2024  grade-boundaries-june-2024-notional-component-gce.pdf · grade-boundaries-june-2024-gce.pdf
//   June 2025  grade-boundaries-june-2025-notional-component-gce.pdf · grade-boundaries-june-2025-gce.pdf
//   June 2026  grade-boundaries-june-2026-notional-component-gce.pdf · grade-boundaries-june-2026-gce.pdf
// Retrieved 2026-08-23.
//
// Two kinds of boundary, and they are NOT interchangeable:
//   components — Pearson's *notional* per-paper boundaries. Pearson states plainly that these
//                'do not equate to actual grades'. They are the only honest answer to 'what is
//                this paper worth', and the app labels them as indicative.
//   overall    — the real subject boundaries, awarded on the total across every paper. For
//                Further Maths these differ by WHICH OPTIONS you sit, so the key is the option
//                pair (3A=FP1, 3B=FS1, 3C=FM1, 3D=D1).
//
// A* is absent from 2019 component rows because Pearson did not publish a notional component A*
// that year — not because it is missing here.
const GRADE_BOUNDARIES={
  // app module id -> spec code, and which Edexcel component each app paper number is
  modules:{
    alevel :{spec:'9MA0',papers:{'1':'01','2':'02','3':'03'}},
    as     :{spec:'8MA0',papers:{'1':'01','2':'02'}},
    fmcp   :{spec:'9FM0',papers:{'1':'01','2':'02'}},
    fp1    :{spec:'9FM0',papers:{'1':'3A'},option:'3A'},
    fs1    :{spec:'9FM0',papers:{'1':'3B'},option:'3B'},
    fm1    :{spec:'9FM0',papers:{'1':'3C'},option:'3C'},
    d1     :{spec:'9FM0',papers:{'1':'3D'},option:'3D'},
    oldc1  :{spec:'6663',legacy:true,papers:{'1':'unit'}},
    oldc2  :{spec:'6664',legacy:true,papers:{'1':'unit'}},
    oldc3  :{spec:'6665',legacy:true,papers:{'1':'unit'}},
    oldc4  :{spec:'6666',legacy:true,papers:{'1':'unit'}},
  },
  // which overall (subject-level) table a track is graded against
  tracks:{as:'8MA0',alevel:'9MA0',fm:'9FM0'},
  optionPaper:{fp1:'3A',fs1:'3B',fm1:'3C',d1:'3D'},
  components:{
    '2019':{alevel:{1:{max:100,A:56,B:45,C:35,D:25,E:15},2:{max:100,A:52,B:42,C:32,D:22,E:13},3:{max:100,A:57,B:46,C:35,D:25,E:15}},as:{1:{max:100,A:63,B:54,C:46,D:38,E:30},2:{max:60,A:38,B:33,C:28,D:23,E:18}},d1:{1:{max:75,A:49,B:41,C:33,D:26,E:19}},fm1:{1:{max:75,A:53,B:44,C:36,D:28,E:20}},fmcp:{1:{max:75,A:49,B:40,C:31,D:23,E:15},2:{max:75,A:45,B:37,C:29,D:21,E:14}},fp1:{1:{max:75,A:53,B:44,C:35,D:27,E:19}},fs1:{1:{max:75,A:52,B:43,C:34,D:25,E:17}}},
    '2022':{alevel:{1:{max:100,'A*':70,A:53,B:42,C:31,D:20,E:10},2:{max:100,'A*':73,A:55,B:43,C:31,D:20,E:9},3:{max:100,'A*':74,A:56,B:44,C:32,D:20,E:9}},as:{1:{max:100,A:60,B:50,C:40,D:31,E:22},2:{max:60,A:35,B:29,C:24,D:19,E:14}},d1:{1:{max:75,'A*':55,A:46,B:38,C:30,D:22,E:14}},fm1:{1:{max:75,'A*':58,A:48,B:38,C:28,D:19,E:10}},fmcp:{1:{max:75,'A*':61,A:51,B:41,C:31,D:21,E:12},2:{max:75,'A*':60,A:50,B:40,C:30,D:21,E:12}},fp1:{1:{max:75,'A*':65,A:54,B:43,C:32,D:22,E:12}},fs1:{1:{max:75,'A*':61,A:51,B:41,C:31,D:21,E:11}}},
    '2023':{alevel:{1:{max:100,'A*':82,A:67,B:54,C:41,D:28,E:16},2:{max:100,'A*':80,A:63,B:51,C:39,D:27,E:16},3:{max:100,'A*':82,A:66,B:53,C:40,D:27,E:15}},as:{1:{max:100,A:65,B:56,C:48,D:40,E:32},2:{max:60,A:38,B:33,C:28,D:24,E:20}},d1:{1:{max:75,'A*':60,A:46,B:38,C:30,D:23,E:16}},fm1:{1:{max:75,'A*':58,A:48,B:40,C:32,D:24,E:17}},fmcp:{1:{max:75,'A*':51,A:43,B:35,C:28,D:21,E:14},2:{max:75,'A*':56,A:46,B:38,C:31,D:24,E:17}},fp1:{1:{max:75,'A*':64,A:60,B:50,C:40,D:30,E:20}},fs1:{1:{max:75,'A*':60,A:52,B:43,C:35,D:27,E:19}}},
    '2024':{alevel:{1:{max:100,'A*':81,A:66,B:53,C:40,D:28,E:16},2:{max:100,'A*':81,A:65,B:53,C:42,D:31,E:20},3:{max:100,'A*':89,A:74,B:60,C:46,D:33,E:20}},as:{1:{max:100,A:60,B:51,C:42,D:34,E:26},2:{max:60,A:45,B:39,C:33,D:27,E:21}},d1:{1:{max:75,'A*':51,A:41,B:33,C:25,D:17,E:10}},fm1:{1:{max:75,'A*':68,A:61,B:51,C:41,D:31,E:22}},fmcp:{1:{max:75,'A*':67,A:60,B:51,C:42,D:33,E:25},2:{max:75,'A*':63,A:56,B:48,C:40,D:32,E:25}},fp1:{1:{max:75,'A*':72,A:69,B:55,C:41,D:27,E:14}},fs1:{1:{max:75,'A*':58,A:49,B:41,C:33,D:26,E:19}}},
    '2025':{alevel:{1:{max:100,'A*':88,A:74,B:61,C:48,D:36,E:24},2:{max:100,'A*':83,A:67,B:55,C:44,D:33,E:22},3:{max:100,'A*':87,A:73,B:61,C:49,D:37,E:25}},as:{1:{max:100,A:63,B:55,C:48,D:41,E:34},2:{max:60,A:45,B:39,C:33,D:28,E:23}},d1:{1:{max:75,'A*':52,A:46,B:38,C:30,D:22,E:14}},fm1:{1:{max:75,'A*':72,A:68,B:57,C:46,D:35,E:25}},fmcp:{1:{max:75,'A*':62,A:53,B:45,C:37,D:29,E:21},2:{max:75,'A*':70,A:61,B:52,C:43,D:34,E:26}},fp1:{1:{max:75,'A*':62,A:57,B:47,C:38,D:29,E:20}},fs1:{1:{max:75,'A*':58,A:51,B:44,C:37,D:31,E:25}}},
    '2026':{alevel:{1:{max:100,'A*':81,A:67,B:55,C:43,D:31,E:19},2:{max:100,'A*':87,A:75,B:62,C:49,D:37,E:25},3:{max:100,'A*':86,A:68,B:56,C:44,D:32,E:20}},as:{1:{max:100,A:66,B:58,C:50,D:42,E:34},2:{max:60,A:47,B:41,C:35,D:29,E:24}},d1:{1:{max:75,'A*':59,A:52,B:43,C:34,D:26,E:18}},fm1:{1:{max:75,'A*':68,A:62,B:52,C:43,D:34,E:25}},fmcp:{1:{max:75,'A*':67,A:60,B:51,C:42,D:33,E:25},2:{max:75,'A*':69,A:62,B:53,C:44,D:35,E:26}},fp1:{1:{max:75,'A*':69,A:63,B:53,C:43,D:33,E:23}},fs1:{1:{max:75,'A*':70,A:66,B:56,C:46,D:37,E:28}}},
  },
  overall:{
    '2018':{'8MA0':{max:160,A:105,B:90,C:75,D:61,E:47},'9MA0':{max:300,'A*':229,A:184,B:155,C:126,D:98,E:70}},
    '2019':{'8MA0':{max:160,A:101,B:87,C:74,D:61,E:48},'9MA0':{max:300,'A*':217,A:165,B:134,C:103,D:73,E:43}},
    '2022':{'8MA0':{max:160,A:95,B:80,C:65,D:50,E:36},'9FM0':{'3A+3B':{max:300,'A*':247,A:206,B:166,C:126,D:86,E:47},'3A+3C':{max:300,'A*':247,A:203,B:163,C:124,D:85,E:46},'3A+3D':{max:300,'A*':242,A:201,B:163,C:125,D:87,E:50},'3A+4A':{max:300,'A*':250,A:209,B:169,C:129,D:89,E:49},'3B+3C':{max:300,'A*':243,A:200,B:161,C:122,D:83,E:45},'3B+3D':{max:300,'A*':238,A:198,B:160,C:123,D:86,E:49},'3B+4B':{max:300,'A*':242,A:201,B:162,C:123,D:85,E:47},'3C+3D':{max:300,'A*':232,A:195,B:158,C:121,D:84,E:48},'3C+4C':{max:300,'A*':238,A:197,B:159,C:121,D:83,E:45},'3D+4D':{max:300,'A*':233,A:192,B:156,C:120,D:84,E:48}},'9MA0':{max:300,'A*':217,A:164,B:130,C:96,D:62,E:28}},
    '2023':{'8MA0':{max:160,A:103,B:90,C:77,D:64,E:52},'9FM0':{'3A+3B':{max:300,'A*':237,A:201,B:168,C:135,D:102,E:70},'3A+3C':{max:300,'A*':233,A:197,B:164,C:132,D:100,E:68},'3A+3D':{max:300,'A*':231,A:195,B:163,C:131,D:99,E:67},'3A+4A':{max:300,'A*':235,A:199,B:165,C:132,D:99,E:66},'3B+3C':{max:300,'A*':224,A:189,B:158,C:127,D:97,E:67},'3B+3D':{max:300,'A*':224,A:187,B:156,C:126,D:96,E:66},'3B+4B':{max:300,'A*':230,A:194,B:162,C:130,D:98,E:66},'3C+3D':{max:300,'A*':220,A:183,B:153,C:123,D:93,E:64},'3C+4C':{max:300,'A*':229,A:193,B:161,C:130,D:99,E:68},'3D+4D':{max:300,'A*':224,A:188,B:156,C:124,D:92,E:61}},'9MA0':{max:300,'A*':244,A:196,B:158,C:121,D:84,E:47}},
    '2024':{'8MA0':{max:160,A:105,B:90,C:75,D:61,E:47},'9FM0':{'3A+3B':{max:300,'A*':263,A:234,B:196,C:158,D:120,E:83},'3A+3C':{max:300,'A*':270,A:246,B:206,C:166,D:126,E:86},'3A+3D':{max:300,'A*':260,A:226,B:188,C:150,D:112,E:74},'3A+4A':{max:300,'A*':269,A:240,B:199,C:159,D:119,E:79},'3B+3C':{max:300,'A*':256,A:226,B:192,C:158,D:124,E:91},'3B+3D':{max:300,'A*':235,A:206,B:174,C:142,D:110,E:79},'3B+4B':{max:300,'A*':241,A:212,B:180,C:148,D:116,E:84},'3C+3D':{max:300,'A*':249,A:218,B:184,C:150,D:116,E:82},'3C+4C':{max:300,'A*':254,A:225,B:191,C:157,D:123,E:89},'3D+4D':{max:300,'A*':243,A:214,B:179,C:144,D:110,E:76}},'9MA0':{max:300,'A*':251,A:205,B:167,C:130,D:93,E:56}},
    '2025':{'8MA0':{max:160,A:108,B:95,C:82,D:69,E:57},'9FM0':{'3A+3B':{max:300,'A*':251,A:222,B:189,C:156,D:124,E:92},'3A+3C':{max:300,'A*':266,A:239,B:202,C:165,D:128,E:92},'3A+3D':{max:300,'A*':243,A:217,B:183,C:149,D:115,E:81},'3A+4A':{max:300,'A*':262,A:233,B:195,C:158,D:121,E:84},'3B+3C':{max:300,'A*':262,A:233,B:199,C:165,D:131,E:97},'3B+3D':{max:300,'A*':245,A:211,B:179,C:148,D:117,E:86},'3B+4B':{max:300,'A*':244,A:215,B:185,C:155,D:125,E:95},'3C+3D':{max:300,'A*':256,A:228,B:192,C:156,D:121,E:86},'3C+4C':{max:300,'A*':262,A:233,B:197,C:161,D:126,E:91},'3D+4D':{max:300,'A*':241,A:212,B:178,C:144,D:110,E:76}},'9MA0':{max:300,'A*':258,A:214,B:178,C:142,D:106,E:71}},
    '2026':{'8FM0':{'21+22':{max:160,A:111,B:96,C:82,D:68,E:54},'21+23':{max:160,A:114,B:100,C:86,D:72,E:58},'21+25':{max:160,A:113,B:99,C:85,D:71,E:57},'21+27':{max:160,A:111,B:97,C:83,D:69,E:56},'23+24':{max:160,A:118,B:104,C:90,D:76,E:62},'23+25':{max:160,A:119,B:105,C:91,D:78,E:65},'23+27':{max:160,A:117,B:103,C:90,D:77,E:64},'25+26':{max:160,A:118,B:104,C:90,D:76,E:63},'25+27':{max:160,A:116,B:102,C:89,D:76,E:63},'27+28':{max:160,A:112,B:98,C:84,D:70,E:57}},'8MA0':{max:160,A:113,B:99,C:85,D:71,E:58},'9FM0':{'3A+3B':{max:300,'A*':275,A:251,B:213,C:176,D:139,E:102},'3A+3C':{max:300,'A*':273,A:247,B:210,C:173,D:136,E:99},'3A+3D':{max:300,'A*':264,A:237,B:200,C:164,D:128,E:92},'3A+4A':{max:300,'A*':263,A:237,B:200,C:163,D:127,E:91},'3B+3C':{max:300,'A*':274,A:250,B:213,C:176,D:140,E:104},'3B+3D':{max:300,'A*':265,A:240,B:204,C:168,D:132,E:97},'3B+4B':{max:300,'A*':271,A:245,B:210,C:175,D:140,E:105},'3C+3D':{max:300,'A*':263,A:236,B:200,C:164,D:129,E:94},'3C+4C':{max:300,'A*':264,A:236,B:200,C:165,D:130,E:95},'3D+4D':{max:300,'A*':262,A:236,B:199,C:162,D:125,E:89}},'9MA0':{max:300,'A*':254,A:210,B:173,C:136,D:100,E:64}},
  },
  // legacy modular units (raw marks). The app's legacy years read 'June 2018' etc.
  legacy:{
    'June 2018':{oldc1:{max:75,A:62,B:56,C:50,D:44,E:38},oldc2:{max:75,A:70,B:63,C:57,D:51,E:45},oldc3:{max:75,'A*':67,A:60,B:53,C:46,D:40,E:34},oldc4:{max:75,'A*':65,A:58,B:51,C:44,D:37,E:31}},
  },
  // Years the app carries papers for that were never sat, so no boundary exists at all.
  notAwarded:{
    '2020':'Summer 2020 exams were cancelled — grades were teacher-assessed, so Pearson published no boundaries.',
    '2021':'Summer 2021 exams were cancelled — grades were teacher-assessed, so Pearson published no boundaries.',
    'Specimen':'Specimen papers were never sat by a cohort, so they have no boundaries.'
  }
};
