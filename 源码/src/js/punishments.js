/* ============================================================
   惩罚内容管理：默认列表 + 本地存储 + 随机抽取
   对外暴露 window.Punishments
   ============================================================ */
window.Punishments = (function () {
  const KEY = 'number-bomb-punishments-v1';
  const MAX_LEN = 14;

  /* 默认惩罚：短句为主（每条 ≤ MAX_LEN 字），数量类一律 ≤20，保证轻松可完成 */
  const DEFAULTS = [
    /* 体能训练 */
    '深蹲 10 个',
    '深蹲 15 个',
    '深蹲 20 个',
    '俯卧撑 10 个',
    '俯卧撑 15 个',
    '俯卧撑 20 个',
    '开合跳 20 个',
    '波比跳 10 个',
    '深蹲跳 15 个',
    '蛙跳 10 个',
    '弓步蹲 20 个',
    '卷腹 20 个',
    '高抬腿 20 个',
    '仰卧起坐 20 个',
    '原地蹦 20 下',
    '跳绳 20 个',
    '踢腿 20 下',
    '提踵 20 下',
    '甩手 20 下',
    '转腰 20 下',
    '扩胸 20 下',
    '深呼吸 10 次',
    '踮脚尖 20 下',
    '原地转 10 圈',
    '平板支撑 20 秒',
    '靠墙静蹲 20 秒',
    '扎马步 20 秒',
    '站军姿 20 秒',
    '单脚站立 20 秒',
    '举高双手 20 秒',

    /* 才艺表演 */
    '高歌一首',
    '唱一首儿歌',
    '唱首生日歌',
    '跳一段舞',
    '表演一个才艺',
    '模仿一位明星',
    '模仿主播喊麦',
    '学 3 种动物叫',
    '学 5 种动物叫',
    '学猫叫 3 声',
    '做 3 个鬼脸',
    '讲个冷笑话',
    '念一段绕口令',
    '用方言说一句',
    '用撒娇语气说话',
    '说句土味情话',
    '夸自己 10 句话',
    '背一首古诗',
    '用英文自我介绍',

    /* 社交互动 */
    '给好友发条语音',
    '给好友点个赞',
    '群发一句祝福',
    '发一条朋友圈',
    '@一位好友夸他',
    '打电话给朋友唱歌',
    '给陌生人点个赞',
    '向镜头比个心',

    /* 搞怪整蛊 */
    '罚喝一杯白开水',
    '罚吃一片柠檬',
    '罚站 20 秒',
    '头上顶书 20 秒',
    '鼻子贴纸条',
    '用嘴叼一支笔',
    '单脚跳到门口',
    '顶着书走十步',
    '学机器人走 10 步',
    '学企鹅走 10 步',
    '学螃蟹走 10 步',
    '用屁股写数字',
    '憋笑 20 秒',
    '闭气 10 秒',
    '对着镜头卖个萌',
    '送观众一个飞吻',
    '大声说我超可爱'
  ];

  function list() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return DEFAULTS.slice();
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : DEFAULTS.slice();
    } catch (e) {
      return DEFAULTS.slice();
    }
  }

  function save(arr) {
    try { localStorage.setItem(KEY, JSON.stringify(arr)); } catch (e) {}
  }

  function add(text) {
    text = (text || '').trim();
    if (!text) return { ok: false, msg: '请输入惩罚内容' };
    if (text.length > MAX_LEN) return { ok: false, msg: '最多 ' + MAX_LEN + ' 个字' };
    const arr = list();
    if (arr.indexOf(text) !== -1) return { ok: false, msg: '已存在该惩罚' };
    arr.push(text);
    save(arr);
    return { ok: true, list: arr };
  }

  function remove(index) {
    const arr = list();
    if (index < 0 || index >= arr.length) return arr;
    arr.splice(index, 1);
    save(arr);
    return arr;
  }

  function reset() {
    save(DEFAULTS.slice());
    return DEFAULTS.slice();
  }

  function random() {
    const arr = list();
    if (!arr.length) return '';
    return arr[Math.floor(Math.random() * arr.length)];
  }

  return { DEFAULTS, MAX_LEN, list, add, remove, reset, random };
})();
