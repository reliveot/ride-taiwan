/**
 * Taiwan 9-Stop Tour, Asymmetric Biome Configs, Sprint Routes & Collectibles for 《騎遍台灣》 V2.3
 */
(function (global) {
  'use strict';

  const LANDMARKS = [
    {
      id: 'taipei_101',
      order: 1,
      icon: '🏙️',
      county: '台北',
      name: '台北 101',
      subtitle: '台北河濱段 · 城市與櫻花起點',
      description: '從台北河濱出發，左側是波光粼粼的淡水河岸，右側是粉紅櫻花與台北 101，正式展開台灣環島單車旅程！',
      image: 'images/landmark_01.jpg',
      roadOffset: 0.22, // Road shifts right -> Left opens up for river & railing
      biome: 'river_left',
      theme: { skyTop: '#BAE6FD', skyBottom: '#FEF3C7', hillBack: '#86EFAC', hillFront: '#4ADE80', ground: '#DCFCE7', accent: '#0F766E', road: '#475569' }
    },
    {
      id: 'nanliao',
      order: 2,
      icon: '🚲',
      county: '新竹',
      name: '南寮漁港',
      subtitle: '新竹海風段 · 十七公里海岸線',
      description: '騎上新竹南寮海濱車道，左側防風林迎風搖曳，右側藍白鐘樓與海天一線在陽光下閃耀。',
      image: 'images/landmark_02.jpg',
      roadOffset: -0.22, // Road shifts left -> Right opens up for ocean & kites
      biome: 'ocean_right',
      theme: { skyTop: '#7DD3FC', skyBottom: '#E0F2FE', hillBack: '#38BDF8', hillFront: '#0EA5E9', ground: '#FEF9C3', accent: '#0284C7', road: '#475569' }
    },
    {
      id: 'gaomei',
      order: 3,
      icon: '🌅',
      county: '台中',
      name: '高美濕地',
      subtitle: '台中濕地夕陽段 · 天空之鏡',
      description: '沿著台中海線前行，右側夕陽濕地映出橘紅晚霞，遠方白色風車緩緩轉動陪伴旅人。',
      image: 'images/landmark_03.jpg',
      roadOffset: -0.22,
      biome: 'wetland_right',
      theme: { skyTop: '#FDA4AF', skyBottom: '#FDE68A', hillBack: '#FDBA74', hillFront: '#FB923C', ground: '#FFEDD5', accent: '#EA580C', road: '#57534E' }
    },
    {
      id: 'anping',
      order: 4,
      icon: '🏯',
      county: '台南',
      name: '安平古堡',
      subtitle: '台南古城段 · 紅磚老樹暖陽',
      description: '進入文化古都台南，左側是紅磚老街屋瓦，右側是茂密老榕樹與溫暖燈籠，充滿府城人情味。',
      image: 'images/landmark_04.jpg',
      roadOffset: 0.0, // Centered road, asymmetric left old street vs right banyan trees
      biome: 'oldtown_asym',
      theme: { skyTop: '#FDE68A', skyBottom: '#FFEDD5', hillBack: '#84CC16', hillFront: '#65A30D', ground: '#FEF3C7', accent: '#B45309', road: '#57534E' }
    },
    {
      id: 'dragon_tiger',
      order: 5,
      icon: '🐉',
      county: '高雄',
      name: '龍虎塔',
      subtitle: '高雄港都段 · 蓮池潭畔陽光',
      description: '來到南台灣高雄，左側港灣與蓮池水面閃耀陽光，右側椰子樹迎風擺動，為單車旅人加油打氣！',
      image: 'images/landmark_05.jpg',
      roadOffset: 0.22,
      biome: 'harbor_left',
      theme: { skyTop: '#7DD3FC', skyBottom: '#FEF9C3', hillBack: '#34D399', hillFront: '#10B981', ground: '#ECFDF5', accent: '#D97706', road: '#475569' }
    },
    {
      id: 'eluanbi',
      order: 6,
      icon: '🌴',
      county: '屏東',
      name: '鵝鑾鼻',
      subtitle: '屏東海岸段 · 最南端的守護光',
      description: '迎著南國海風抵達墾丁，左側熱帶草坡與右側湛藍巴士海峽一路相伴，遠方白燈塔閃耀光芒。',
      image: 'images/landmark_06.jpg',
      roadOffset: -0.20,
      biome: 'ocean_right',
      theme: { skyTop: '#60A5FA', skyBottom: '#E0F2FE', hillBack: '#22C55E', hillFront: '#16A34A', ground: '#DCFCE7', accent: '#0369A1', road: '#475569' }
    },
    {
      id: 'sanxiantai',
      order: 7,
      icon: '🌊',
      county: '台東',
      name: '三仙台',
      subtitle: '台東海線段 · 太平洋晨光',
      description: '轉入東台灣台 11 線，右側太平洋浪花拍打礁岩與消波塊，紅白八拱橋迎接溫暖的晨光與海風。',
      image: 'images/landmark_07.jpg',
      roadOffset: -0.22,
      biome: 'ocean_right',
      theme: { skyTop: '#FBCFE8', skyBottom: '#FDE68A', hillBack: '#0EA5E9', hillFront: '#0284C7', ground: '#F0F9FF', accent: '#E11D48', road: '#475569' }
    },
    {
      id: 'qixingtan',
      order: 8,
      icon: '⛰️',
      county: '花蓮',
      name: '七星潭',
      subtitle: '花蓮山海段 · 斷崖與月牙灣',
      description: '沿著花蓮濱海自行車道奔馳，左側是高聳山壁，右側是遼闊的太平洋月牙礫石海灣。',
      image: 'images/landmark_08.jpg',
      roadOffset: -0.22,
      biome: 'cliff_ocean',
      theme: { skyTop: '#BAE6FD', skyBottom: '#F0FDF4', hillBack: '#059669', hillFront: '#047857', ground: '#E0F2FE', accent: '#0D9488', road: '#475569' }
    },
    {
      id: 'waiao',
      order: 9,
      icon: '🏖️',
      county: '宜蘭',
      name: '外澳海灘',
      subtitle: '宜蘭蘭陽段 · 龜山島與環島圓滿',
      description: '最後一站來到宜蘭外澳，左側翠綠蘭陽水田、右側沙灘浪花與海上龜山島，恭喜完成環島一圈！',
      image: 'images/landmark_09.jpg',
      roadOffset: -0.22,
      biome: 'paddy_ocean',
      theme: { skyTop: '#A5F3FC', skyBottom: '#FEF3C7', hillBack: '#4ADE80', hillFront: '#22C55E', ground: '#ECFDF5', accent: '#0F766E', road: '#475569' }
    }
  ];

  const SPRINT_ROUTES = [
    { id: 'west_coast', name: '北中海線衝線（台北 → 台中）', startStation: 0, distanceUnits: 3000, seed: 202611 },
    { id: 'south_east', name: '南東山海衝線（高雄 → 花蓮）', startStation: 4, distanceUnits: 4000, seed: 202622 },
    { id: 'full_island', name: '全環島九站衝線（台北 → 宜蘭）', startStation: 0, distanceUnits: 9000, seed: 202699 }
  ];

  const COLLECTIBLES = [
    { id: 'banana', name: '旗山香蕉', icon: '🍌', stamina: 8, color: '#EAB308' },
    { id: 'water', name: '運動水壺', icon: '🧴', stamina: 6, color: '#0EA5E9' },
    { id: 'boba', name: '珍珠奶茶', icon: '🧋', stamina: 9, color: '#D97706' },
    { id: 'onigiri', name: '池上飯糰', icon: '🍙', stamina: 8, color: '#10B981' }
  ];

  global.RideTaiwanData = {
    LANDMARKS,
    SPRINT_ROUTES,
    COLLECTIBLES,
    UNITS_PER_STATION: 1600
  };
})(window);
