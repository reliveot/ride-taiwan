/**
 * Taiwan 9-Stop Tour, Fixed Sprint Routes & Collectibles for 《騎遍台灣》 V2.0
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
      subtitle: '啟程！城市與山林的起點',
      description: '從台北河濱出發，仰望高聳的台北 101 與春日櫻花，正式展開台灣環島單車旅程！',
      image: 'images/landmark_01.jpg',
      theme: { skyTop: '#BAE6FD', skyBottom: '#FEF3C7', hillBack: '#86EFAC', hillFront: '#4ADE80', ground: '#DCFCE7', accent: '#0F766E', road: '#475569' }
    },
    {
      id: 'nanliao',
      order: 2,
      icon: '🚲',
      county: '新竹',
      name: '南寮漁港',
      subtitle: '迎風飛翔的十七公里海岸線',
      description: '騎上新竹南寮海濱車道，藍白鐘樓與漫天風箏在陽光下閃耀，海風帶來滿滿活力。',
      image: 'images/landmark_02.jpg',
      theme: { skyTop: '#7DD3FC', skyBottom: '#E0F2FE', hillBack: '#38BDF8', hillFront: '#0EA5E9', ground: '#FEF9C3', accent: '#0284C7', road: '#475569' }
    },
    {
      id: 'gaomei',
      order: 3,
      icon: '🌅',
      county: '台中',
      name: '高美濕地',
      subtitle: '夕陽映照的天空之鏡',
      description: '沿著台中海線前行，木棧道延伸入金橘色晚霞，遠方白色風車緩緩轉動陪伴旅人。',
      image: 'images/landmark_03.jpg',
      theme: { skyTop: '#FDA4AF', skyBottom: '#FDE68A', hillBack: '#FDBA74', hillFront: '#FB923C', ground: '#FFEDD5', accent: '#EA580C', road: '#57534E' }
    },
    {
      id: 'anping',
      order: 4,
      icon: '🏯',
      county: '台南',
      name: '安平古堡',
      subtitle: '紅磚老樹的府城暖陽',
      description: '進入文化古都台南，紅磚古城牆與老榕樹氣根在金色陽光下顯得格外溫暖親切。',
      image: 'images/landmark_04.jpg',
      theme: { skyTop: '#FDE68A', skyBottom: '#FFEDD5', hillBack: '#84CC16', hillFront: '#65A30D', ground: '#FEF3C7', accent: '#B45309', road: '#57534E' }
    },
    {
      id: 'dragon_tiger',
      order: 5,
      icon: '🐉',
      county: '高雄',
      name: '龍虎塔',
      subtitle: '蓮池潭畔的熱情陽光',
      description: '來到南台灣高雄蓮池潭，繽紛的龍虎雙塔與盛開粉紅蓮花，為單車旅人加油打氣！',
      image: 'images/landmark_05.jpg',
      theme: { skyTop: '#7DD3FC', skyBottom: '#FEF9C3', hillBack: '#34D399', hillFront: '#10B981', ground: '#ECFDF5', accent: '#D97706', road: '#475569' }
    },
    {
      id: 'eluanbi',
      order: 6,
      icon: '🌴',
      county: '屏東',
      name: '鵝鑾鼻',
      subtitle: '台灣最南端的守護光芒',
      description: '迎著南國海風抵達墾丁鵝鑾鼻，潔白燈塔矗立在翠綠草坡上，眺望湛藍巴士海峽。',
      image: 'images/landmark_06.jpg',
      theme: { skyTop: '#60A5FA', skyBottom: '#E0F2FE', hillBack: '#22C55E', hillFront: '#16A34A', ground: '#DCFCE7', accent: '#0369A1', road: '#475569' }
    },
    {
      id: 'sanxiantai',
      order: 7,
      icon: '🌊',
      county: '台東',
      name: '三仙台',
      subtitle: '跨海八拱橋的太平洋曙光',
      description: '轉入東台灣台 11 線，太平洋浪花拍打礁岩，紅白八拱橋迎接溫暖的晨光與海風。',
      image: 'images/landmark_07.jpg',
      theme: { skyTop: '#FBCFE8', skyBottom: '#FDE68A', hillBack: '#0EA5E9', hillFront: '#0284C7', ground: '#F0F9FF', accent: '#E11D48', road: '#475569' }
    },
    {
      id: 'qixingtan',
      order: 8,
      icon: '⛰️',
      county: '花蓮',
      name: '七星潭',
      subtitle: '大山與月牙海灣的對話',
      description: '沿著花蓮濱海自行車道奔馳，左側是雄偉中央山脈，右側是療癒的月牙形礫石海灣。',
      image: 'images/landmark_08.jpg',
      theme: { skyTop: '#BAE6FD', skyBottom: '#F0FDF4', hillBack: '#059669', hillFront: '#047857', ground: '#E0F2FE', accent: '#0D9488', road: '#475569' }
    },
    {
      id: 'waiao',
      order: 9,
      icon: '🏖️',
      county: '宜蘭',
      name: '外澳海灘',
      subtitle: '遙望龜山島的環島圓滿',
      description: '最後一站來到宜蘭外澳沙灘，望著海上龜山島與溫柔浪花，恭喜完成台灣環島一圈！',
      image: 'images/landmark_09.jpg',
      theme: { skyTop: '#A5F3FC', skyBottom: '#FEF3C7', hillBack: '#4ADE80', hillFront: '#22C55E', ground: '#ECFDF5', accent: '#0F766E', road: '#475569' }
    }
  ];

  // Fixed Sprint Routes (for fair historical time comparison with seeded events)
  const SPRINT_ROUTES = [
    { id: 'west_coast', name: '北中海線衝線（台北 → 台中）', startStation: 0, distanceUnits: 3000, seed: 202611 },
    { id: 'south_east', name: '南東山海衝線（高雄 → 花蓮）', startStation: 4, distanceUnits: 4000, seed: 202622 },
    { id: 'full_island', name: '全環島九站衝線（台北 → 宜蘭）', startStation: 0, distanceUnits: 9000, seed: 202699 }
  ];

  const COLLECTIBLES = [
    { id: 'banana', name: '旗山香蕉', icon: '🍌', stamina: 12, color: '#EAB308' },
    { id: 'water', name: '運動水壺', icon: '🧴', stamina: 10, color: '#0EA5E9' },
    { id: 'boba', name: '珍珠奶茶', icon: '🧋', stamina: 14, color: '#D97706' },
    { id: 'onigiri', name: '池上飯糰', icon: '🍙', stamina: 12, color: '#10B981' }
  ];

  global.RideTaiwanData = {
    LANDMARKS,
    SPRINT_ROUTES,
    COLLECTIBLES,
    UNITS_PER_STATION: 1000 // 9 stations = 9000 units for 1 full Taiwan loop
  };
})(window);
