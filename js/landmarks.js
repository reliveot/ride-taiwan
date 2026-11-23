/**
 * Taiwan Landmarks & Collectibles Data for 《騎遍台灣》 V1.0
 */
(function (global) {
  'use strict';

  const LANDMARKS = [
    {
      id: 'taipei_101',
      county: '台北市',
      name: '台北 101',
      subtitle: '啟程！城市與山林的起點',
      description: '從繁華的台北出發，仰望高聳的台北 101，迎著春風與櫻花展開單車環島之旅！',
      image: 'images/landmark_01.jpg',
      theme: {
        skyTop: '#BAE6FD',
        skyBottom: '#FEF3C7',
        hillBack: '#86EFAC',
        hillFront: '#4ADE80',
        ground: '#DCFCE7',
        accent: '#0F766E'
      }
    },
    {
      id: 'yehliu',
      county: '新北市',
      name: '野柳女王頭',
      subtitle: '北海岸的奇岩海風',
      description: '沿著北海岸公路騎行，海風吹拂臉龐，欣賞大自然雕刻千年的女王頭奇景。',
      image: 'images/landmark_02.jpg',
      theme: {
        skyTop: '#93C5FD',
        skyBottom: '#FDE68A',
        hillBack: '#38BDF8',
        hillFront: '#60A5FA',
        ground: '#FEF3C7',
        accent: '#0284C7'
      }
    },
    {
      id: 'gaomei',
      county: '台中市',
      name: '高美濕地',
      subtitle: '夕陽映照的天空之鏡',
      description: '騎進台中海線，木棧道延伸入金橘色晚霞與潮汐濕地，風車緩緩轉動陪伴旅人。',
      image: 'images/landmark_03.jpg',
      theme: {
        skyTop: '#FDA4AF',
        skyBottom: '#FDE68A',
        hillBack: '#FDBA74',
        hillFront: '#FB923C',
        ground: '#FFEDD5',
        accent: '#EA580C'
      }
    },
    {
      id: 'alishan',
      county: '嘉義縣',
      name: '阿里山',
      subtitle: '雲海與神木的森林浴',
      description: '穿梭在百年檜木林間，看見紅色森林小火車鳴笛經過，感受山林的清新芬多精。',
      image: 'images/landmark_04.jpg',
      theme: {
        skyTop: '#A7F3D0',
        skyBottom: '#FEF08A',
        hillBack: '#15803D',
        hillFront: '#166534',
        ground: '#D1FAE5',
        accent: '#15803D'
      }
    },
    {
      id: 'dragon_tiger',
      county: '高雄市',
      name: '龍虎塔',
      subtitle: '蓮池潭畔的熱情陽光',
      description: '來到熱情的南台灣高雄，在蓮池潭邊欣賞繽紛的龍虎雙塔與盛開的粉紅蓮花！',
      image: 'images/landmark_05.jpg',
      theme: {
        skyTop: '#7DD3FC',
        skyBottom: '#FEF9C3',
        hillBack: '#34D399',
        hillFront: '#10B981',
        ground: '#ECFDF5',
        accent: '#D97706'
      }
    },
    {
      id: 'eluanbi',
      county: '屏東縣',
      name: '鵝鑾鼻燈塔',
      subtitle: '台灣最南端的守護光芒',
      description: '迎著南國海風抵達台灣最南端，潔白的燈塔矗立在翠綠草坡上，眺望湛藍巴士海峽。',
      image: 'images/landmark_06.jpg',
      theme: {
        skyTop: '#60A5FA',
        skyBottom: '#E0F2FE',
        hillBack: '#22C55E',
        hillFront: '#16A34A',
        ground: '#DCFCE7',
        accent: '#0369A1'
      }
    },
    {
      id: 'sanxiantai',
      county: '台東縣',
      name: '三仙台',
      subtitle: '跨海八拱橋的太平洋曙光',
      description: '轉往東台灣台 11 線，太平洋的浪花拍打礁岩，紅白相間的八拱橋迎接溫暖晨光。',
      image: 'images/landmark_07.jpg',
      theme: {
        skyTop: '#FBCFE8',
        skyBottom: '#FDE68A',
        hillBack: '#0EA5E9',
        hillFront: '#0284C7',
        ground: '#F0F9FF',
        accent: '#E11D48'
      }
    },
    {
      id: 'qixingtan',
      county: '花蓮縣',
      name: '七星潭',
      subtitle: '大山與月牙海灣的對話',
      description: '沿著花蓮濱海自行車道前行，一側是雄偉的中央山脈，一側是蔚藍的月牙形礫石海灣。',
      image: 'images/landmark_08.jpg',
      theme: {
        skyTop: '#BAE6FD',
        skyBottom: '#F0FDF4',
        hillBack: '#059669',
        hillFront: '#047857',
        ground: '#E0F2FE',
        accent: '#0D9488'
      }
    },
    {
      id: 'lanyang',
      county: '宜蘭縣',
      name: '蘭陽博物館',
      subtitle: '單面山倒影與環島圓滿',
      description: '最後一站來到宜蘭烏石港畔，單面山造型的博物館倒映在平靜水面上，恭喜完成環島旅程！',
      image: 'images/landmark_09.jpg',
      theme: {
        skyTop: '#A5F3FC',
        skyBottom: '#FEF3C7',
        hillBack: '#4ADE80',
        hillFront: '#22C55E',
        ground: '#ECFDF5',
        accent: '#0F766E'
      }
    }
  ];

  const COLLECTIBLES = [
    { id: 'stamp', name: '旅行郵票', icon: '📮', points: 10, color: '#EF4444' },
    { id: 'water', name: '運動水壺', icon: '🧴', points: 10, color: '#0EA5E9' },
    { id: 'banana', name: '旗山香蕉', icon: '🍌', points: 15, color: '#EAB308' },
    { id: 'boba', name: '珍珠奶茶', icon: '🧋', points: 15, color: '#D97706' },
    { id: 'pineapple', name: '鳳梨酥', icon: '🍍', points: 20, color: '#F59E0B' }
  ];

  global.RideTaiwanData = {
    LANDMARKS,
    COLLECTIBLES
  };
})(window);
