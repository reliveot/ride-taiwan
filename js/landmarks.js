/**
 * Taiwan 17-Stop Mainland Tour + Penghu Island Special Route, Sub-Biomes & Collectibles for 《騎遍台灣》 V3.0
 */
(function (global) {
  'use strict';

  const LANDMARKS = [
    {
      id: 'keelung_zhengbin', order: 1, icon: '⛵', county: '基隆', name: '正濱漁港',
      subtitle: '基隆港灣段 · 彩色屋起點',
      description: '從雨都基隆的彩色漁港出發，左側停滿漁船與彩色小屋，迎著海風展開環島大冒險！',
      image: '', roadOffset: 0.18, biome: 'river_left',
      localSnack: { name: '廟口泡泡冰', icon: '🍧', stamina: 10, color: '#EC4899' },
      theme: { skyTop: '#93C5FD', skyBottom: '#E0F2FE', hillBack: '#60A5FA', hillFront: '#3B82F6', ground: '#F1F5F9', accent: '#0284C7', road: '#475569' }
    },
    {
      id: 'taipei_101', order: 2, icon: '🏙️', county: '台北', name: '台北 101',
      subtitle: '台北河濱段 · 城市與櫻花',
      description: '騎進台北河濱紅道，左側是波光粼粼的淡水河岸與高架橋，右側是粉紅櫻花與台北 101！',
      image: 'images/landmark_01.jpg', roadOffset: 0.20, biome: 'river_left',
      localSnack: { name: '珍珠奶茶', icon: '🧋', stamina: 10, color: '#D97706' },
      theme: { skyTop: '#BAE6FD', skyBottom: '#FEF3C7', hillBack: '#86EFAC', hillFront: '#4ADE80', ground: '#DCFCE7', accent: '#0F766E', road: '#7f1d1d' }
    },
    {
      id: 'tamsui_wharf', order: 3, icon: '🌉', county: '新北', name: '淡水漁人碼頭',
      subtitle: '新北河海段 · 情人橋夕照',
      description: '沿著金色水岸騎到淡水出海口，遠方白色斜張情人橋橫跨港灣，海風吹來陣陣愜意。',
      image: '', roadOffset: 0.18, biome: 'river_left',
      localSnack: { name: '淡水阿給', icon: '🥟', stamina: 9, color: '#EA580C' },
      theme: { skyTop: '#FDBA74', skyBottom: '#FEF08A', hillBack: '#60A5FA', hillFront: '#38BDF8', ground: '#FEF3C7', accent: '#D97706', road: '#475569' }
    },
    {
      id: 'daxi_oldstreet', order: 4, icon: '🏮', county: '桃園', name: '大溪老街',
      subtitle: '桃園城市段 · 巴洛克牌樓',
      description: '穿過大漢溪畔進入桃園大溪，兩側紅磚老街牌樓與木藝小店夾道，充滿懷舊風情。',
      image: '', roadOffset: 0.0, biome: 'oldtown_asym',
      localSnack: { name: '大溪豆干', icon: '🟫', stamina: 9, color: '#92400E' },
      theme: { skyTop: '#BAE6FD', skyBottom: '#FFEDD5', hillBack: '#84CC16', hillFront: '#65A30D', ground: '#FEF3C7', accent: '#B45309', road: '#57534E' }
    },
    {
      id: 'nanliao', order: 5, icon: '🚲', county: '新竹', name: '南寮漁港',
      subtitle: '新竹海風段 · 十七公里海岸',
      description: '騎上新竹南寮海濱車道，左側防風林迎風搖曳，右側藍白鐘樓與漫天風箏在陽光下閃耀。',
      image: 'images/landmark_02.jpg', roadOffset: -0.20, biome: 'ocean_right',
      localSnack: { name: '新竹貢丸', icon: '🍢', stamina: 10, color: '#F59E0B' },
      theme: { skyTop: '#7DD3FC', skyBottom: '#E0F2FE', hillBack: '#38BDF8', hillFront: '#0EA5E9', ground: '#FEF9C3', accent: '#0284C7', road: '#475569' }
    },
    {
      id: 'longteng_bridge', order: 6, icon: '🧱', county: '苗栗', name: '龍騰斷橋',
      subtitle: '苗栗山城段 · 紅磚古橋鐵道',
      description: '騎入苗栗三義山城，翠綠山谷間矗立著百年紅磚拱橋遺跡，空氣裡滿是山林氣息。',
      image: '', roadOffset: -0.14, biome: 'mountain_inland',
      localSnack: { name: '客家擂茶', icon: '🍵', stamina: 9, color: '#16A34A' },
      theme: { skyTop: '#A7F3D0', skyBottom: '#FEF9C3', hillBack: '#15803D', hillFront: '#166534', ground: '#DCFCE7', accent: '#B45309', road: '#57534E' }
    },
    {
      id: 'gaomei', order: 7, icon: '🌅', county: '台中', name: '高美濕地',
      subtitle: '台中濕地夕陽段 · 天空之鏡',
      description: '沿著台中海線前行，右側夕陽濕地映出橘紅晚霞，遠方白色風車緩緩轉動陪伴旅人。',
      image: 'images/landmark_03.jpg', roadOffset: -0.20, biome: 'wetland_right',
      localSnack: { name: '台中太陽餅', icon: '🥮', stamina: 10, color: '#D97706' },
      theme: { skyTop: '#FDA4AF', skyBottom: '#FDE68A', hillBack: '#FDBA74', hillFront: '#FB923C', ground: '#FFEDD5', accent: '#EA580C', road: '#78350f' }
    },
    {
      id: 'baguashan', order: 8, icon: '🌾', county: '彰化', name: '八卦山大佛',
      subtitle: '彰化鄉間段 · 平原水圳稻浪',
      description: '穿過濁水溪北岸來到彰化平原，翠綠稻田與水圳一路相伴，遠方莊嚴大佛俯瞰大地。',
      image: '', roadOffset: 0.0, biome: 'paddy_inland',
      localSnack: { name: '彰化肉圓', icon: '🥟', stamina: 10, color: '#B45309' },
      theme: { skyTop: '#BAE6FD', skyBottom: '#FEF9C3', hillBack: '#4ADE80', hillFront: '#22C55E', ground: '#ECFDF5', accent: '#15803D', road: '#475569' }
    },
    {
      id: 'sun_moon_lake', order: 9, icon: '🛶', county: '南投', name: '日月潭',
      subtitle: '南投湖畔支線 · 水上自行車道',
      description: '轉入南投山線支線騎上日月潭水上車道，左側碧綠湖面與慈恩塔倒影相映，涼風徐徐吹來。',
      image: '', roadOffset: 0.20, biome: 'river_left',
      localSnack: { name: '日月潭紅茶', icon: '🫖', stamina: 9, color: '#0D9488' },
      theme: { skyTop: '#A5F3FC', skyBottom: '#ECFDF5', hillBack: '#10B981', hillFront: '#059669', ground: '#D1FAE5', accent: '#0D9488', road: '#475569' }
    },
    {
      id: 'beigang_temple', order: 10, icon: '🏮', county: '雲林', name: '北港朝天宮',
      subtitle: '雲林鄉間段 · 平原小鎮廟埕',
      description: '騎進熱情的雲林北港，水圳田野連接紅瓦飛簷與傳統老街，處處充滿台灣在地人情味。',
      image: '', roadOffset: 0.0, biome: 'paddy_inland',
      localSnack: { name: '北港碗粿', icon: '🍚', stamina: 9, color: '#D97706' },
      theme: { skyTop: '#FDE68A', skyBottom: '#FFEDD5', hillBack: '#84CC16', hillFront: '#65A30D', ground: '#FEF3C7', accent: '#DC2626', road: '#57534E' }
    },
    {
      id: 'alishan_forest', order: 11, icon: '🚂', county: '嘉義', name: '阿里山林道',
      subtitle: '嘉義山林支線 · 雲海與神木',
      description: '轉入嘉義山林支線穿梭高聳神木林間，遠方紅色森林小火車鳴笛經過，帶來滿滿芬多精。',
      image: '', roadOffset: -0.14, biome: 'mountain_inland',
      localSnack: { name: '嘉義雞肉飯', icon: '🍗', stamina: 11, color: '#EA580C' },
      theme: { skyTop: '#A7F3D0', skyBottom: '#FEF08A', hillBack: '#15803D', hillFront: '#166534', ground: '#D1FAE5', accent: '#15803D', road: '#475569' }
    },
    {
      id: 'anping', order: 12, icon: '🏯', county: '台南', name: '安平古堡',
      subtitle: '台南古城段 · 紅磚老樹暖陽',
      description: '回到西部沿海進入文化古都台南，左側紅磚老街屋瓦，右側茂密老榕樹與溫暖燈籠。',
      image: 'images/landmark_04.jpg', roadOffset: 0.0, biome: 'oldtown_asym',
      localSnack: { name: '台南牛肉湯', icon: '🍲', stamina: 11, color: '#DC2626' },
      theme: { skyTop: '#FDE68A', skyBottom: '#FFEDD5', hillBack: '#84CC16', hillFront: '#65A30D', ground: '#FEF3C7', accent: '#B45309', road: '#57534E' }
    },
    {
      id: 'dragon_tiger', order: 13, icon: '🐉', county: '高雄', name: '龍虎塔',
      subtitle: '高雄港都段 · 蓮池潭畔陽光',
      description: '來到南台灣高雄，左側港灣與蓮池水面閃耀陽光，右側椰子樹迎風擺動，為單車旅人加油打氣！',
      image: 'images/landmark_05.jpg', roadOffset: 0.20, biome: 'river_left',
      localSnack: { name: '旗山香蕉', icon: '🍌', stamina: 10, color: '#EAB308' },
      theme: { skyTop: '#7DD3FC', skyBottom: '#FEF9C3', hillBack: '#34D399', hillFront: '#10B981', ground: '#ECFDF5', accent: '#D97706', road: '#475569' }
    },
    {
      id: 'eluanbi', order: 14, icon: '🌴', county: '屏東', name: '鵝鑾鼻',
      subtitle: '屏東海岸段 · 最南端的守護光',
      description: '迎著南國海風抵達墾丁，左側熱帶草坡與右側湛藍巴士海峽一路相伴，遠方白燈塔閃耀光芒。',
      image: 'images/landmark_06.jpg', roadOffset: -0.18, biome: 'ocean_right',
      localSnack: { name: '東港黑鮪魚', icon: '🍣', stamina: 11, color: '#EF4444' },
      theme: { skyTop: '#60A5FA', skyBottom: '#E0F2FE', hillBack: '#22C55E', hillFront: '#16A34A', ground: '#DCFCE7', accent: '#0369A1', road: '#475569' }
    },
    {
      id: 'sanxiantai', order: 15, icon: '🌊', county: '台東', name: '三仙台',
      subtitle: '台東海線段 · 太平洋晨光',
      description: '轉入東台灣台 11 線，右側太平洋浪花拍打礁岩與海灣，紅白八拱橋迎接溫暖的晨光與海風。',
      image: 'images/landmark_07.jpg', roadOffset: -0.20, biome: 'cliff_ocean',
      localSnack: { name: '池上飯糰', icon: '🍙', stamina: 10, color: '#10B981' },
      theme: { skyTop: '#FBCFE8', skyBottom: '#FDE68A', hillBack: '#0EA5E9', hillFront: '#0284C7', ground: '#F0F9FF', accent: '#E11D48', road: '#475569' }
    },
    {
      id: 'qixingtan', order: 16, icon: '🏔️', county: '花蓮', name: '七星潭',
      subtitle: '花蓮山海段 · 斷崖與月牙灣',
      description: '沿著花蓮濱海自行車道奔馳，左側是連綿起伏的高聳山壁，右側是遼闊的太平洋月牙海灣。',
      image: 'images/landmark_08.jpg', roadOffset: -0.20, biome: 'cliff_ocean',
      localSnack: { name: '花蓮麻糬', icon: '🍡', stamina: 9, color: '#EC4899' },
      theme: { skyTop: '#BAE6FD', skyBottom: '#F0FDF4', hillBack: '#059669', hillFront: '#047857', ground: '#E0F2FE', accent: '#0D9488', road: '#475569' }
    },
    {
      id: 'waiao', order: 17, icon: '🏖️', county: '宜蘭', name: '外澳海灘',
      subtitle: '宜蘭蘭陽段 · 龜山島海風',
      description: '最後一站來到宜蘭外澳沙灘，左側翠綠蘭陽水田、右側沙灘浪花與海上龜山島，完成本島環島一圈！',
      image: 'images/landmark_09.jpg', roadOffset: -0.20, biome: 'ocean_right',
      localSnack: { name: '三星蔥油餅', icon: '🥞', stamina: 10, color: '#16A34A' },
      theme: { skyTop: '#A5F3FC', skyBottom: '#FEF3C7', hillBack: '#4ADE80', hillFront: '#22C55E', ground: '#ECFDF5', accent: '#0F766E', road: '#475569' }
    }
  ];

  // Independent Island Special Stage!
  const PENGHU_SPECIAL = {
    id: 'penghu_bridge', order: 18, icon: '🏝️', county: '澎湖', name: '跨海大橋',
    subtitle: '離島特別篇 · 菊島碧海藍天',
    description: '搭船跳島來到澎湖跨海大橋！兩側都是無邊際的碧藍大海與玄武岩海岸，享受離島單車假期！',
    image: '', roadOffset: -0.18, biome: 'ocean_right',
    localSnack: { name: '仙人掌冰', icon: '🌵', stamina: 11, color: '#DB2777' },
    theme: { skyTop: '#38BDF8', skyBottom: '#E0F2FE', hillBack: '#0EA5E9', hillFront: '#0284C7', ground: '#FEF9C3', accent: '#0369A1', road: '#475569' }
  };

  const SPRINT_ROUTES = [
    { id: 'west_coast', name: '北中河海衝線（基隆 → 台中，7站）', startStation: 0, distanceUnits: 38500, seed: 202611, special: false },
    { id: 'south_east', name: '南東山海衝線（台南 → 宜蘭，6站）', startStation: 11, distanceUnits: 33000, seed: 202622, special: false },
    { id: 'penghu_island', name: '🏝️ 離島特別篇：澎湖跨海大橋', startStation: 0, distanceUnits: 11000, seed: 202688, special: true },
    { id: 'full_island', name: '本島 17 站大環島衝線', startStation: 0, distanceUnits: 93500, seed: 202699, special: false }
  ];

  const COLLECTIBLES = [
    { id: 'banana', name: '旗山香蕉', icon: '🍌', stamina: 10, color: '#EAB308' },
    { id: 'water', name: '運動水壺', icon: '🧴', stamina: 8, color: '#0EA5E9' },
    { id: 'boba', name: '珍珠奶茶', icon: '🧋', stamina: 11, color: '#D97706' },
    { id: 'onigiri', name: '池上飯糰', icon: '🍙', stamina: 10, color: '#10B981' }
  ];

  const BUMP_SKINS = [
    { id: 'puddle', icon: '💦', label: '積水', bg: '#fee2e2', border: '#ef4444', ellipse: true },
    { id: 'rock', icon: '🪨', label: '碎石堆', bg: '#fee2e2', border: '#ef4444', ellipse: false },
    { id: 'speedbump', icon: '🕳️', label: '路面坑洞', bg: '#fee2e2', border: '#ef4444', ellipse: true },
    { id: 'cone', icon: '🔺', label: '路障三角錐', bg: '#ffedd5', border: '#ea580c', ellipse: false }
  ];

  const CYCLIST_SKINS = [
    { id: 'cyclist', icon: '🚴', label: '慢速車友', bg: '#fef3c7', border: '#d97706' },
    { id: 'scooter', icon: '🛵', label: '慢速歐兜邁', bg: '#e0f2fe', border: '#0284c7' },
    { id: 'grandma', icon: '🚲', label: '買菜阿嬤車', bg: '#fce7f3', border: '#db2777' }
  ];

  const BIKES = [
    {
      id: 'ubike', name: '微笑單車 YouBike', icon: '🚲',
      tag: '均衡穩健', speedMult: 1.0, drainMult: 1.0, unlockDist: 0,
      desc: '速度與體力消耗均衡，最適合穩定練習與環島旅行。',
      frameColor: '#f59e0b'
    },
    {
      id: 'roadbike', name: '碳纖公路車', icon: '🏎️',
      tag: '高速衝刺', speedMult: 1.28, drainMult: 1.30, unlockDist: 5500,
      desc: '速度極快 (+28%)，但體力消耗較高 (+30%)，需積極吃補給！',
      frameColor: '#dc2626'
    },
    {
      id: 'ebike', name: '電動輔助單車', icon: '⚡',
      tag: '省力續航', speedMult: 0.90, drainMult: 0.62, unlockDist: 11000,
      desc: '體力消耗大幅減低 (-38%)，極速較保守，續航遠征首選！',
      frameColor: '#0284c7'
    }
  ];

  const CHARACTERS = [
    { id: 'ming', name: '阿明', role: '陽光少年', icon: '🧢', jersey: '#ea580c', pack: '#f59e0b', helmet: '#0d9488' },
    { id: 'mei', name: '小美', role: '環島女孩', icon: '🎀', jersey: '#ec4899', pack: '#fde047', helmet: '#f43f5e' },
    { id: 'chen', name: '陳伯伯', role: '樂活銀髮', icon: '👴', jersey: '#0f766e', pack: '#cbd5e1', helmet: '#eab308' }
  ];

  global.RideTaiwanData = {
    LANDMARKS,
    PENGHU_SPECIAL,
    SPRINT_ROUTES,
    COLLECTIBLES,
    BUMP_SKINS,
    CYCLIST_SKINS,
    BIKES,
    CHARACTERS,
    UNITS_PER_STATION: 5500
  };
})(window);
