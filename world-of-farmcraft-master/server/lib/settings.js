import { query } from './db.js';

let settings = {};
const tileType = {};
const building = {};
const weaponType = {};
const marketPrice = {};
const naturalEvent = {};

async function init() {
  try {
    // تحميل الإعدادات
    const settingsRows = await query('SELECT * FROM wof_settings WHERE id_settings = 1 LIMIT 1');
    if (settingsRows.length > 0) {
      settings = settingsRows[0];
    }

    // تحميل أنواع البلاط
    const tileTypeRows = await query('SELECT id_tile_type AS id, name, price FROM wof_tile_type');
    for (const row of tileTypeRows) {
      tileType[row.name] = row;
    }

    // تحميل أسعار السوق
    const marketRows = await query('SELECT type, price FROM wof_market');
    for (const row of marketRows) {
      marketPrice[row.type] = row.price;
    }

    // تحميل إعدادات المباني
    const buildingRows = await query('SELECT type, running_cost, capacity, width, height FROM wof_building_settings');
    for (const row of buildingRows) {
      building[row.type] = row;
    }

    // تحميل أنواع الأسلحة
    const weaponRows = await query('SELECT id_weapon_type AS id, name, price FROM wof_weapon_type');
    for (const row of weaponRows) {
      weaponType[row.name] = row;
    }

    // تحميل الأحداث الطبيعية
    const eventRows = await query('SELECT name, probability FROM wof_natural_event');
    for (const row of eventRows) {
      naturalEvent[row.name] = row.probability;
    }

    console.log('Settings loaded successfully');

  } catch (error) {
    console.error('Failed to load settings:', error);
    throw error;
  }
}

function getData() {
  return { ...settings };
}

function getDisplayData(socket) {
  const tmp = {
    tileWidth: settings.tileWidth,
    tileHeight: settings.tileHeight,
    mapSpeed: settings.mapSpeed,
    characterSpeed: settings.characterSpeed
  };

  if (socket === undefined) {
    return tmp;
  }
  socket.emit('getDisplaySettingsAnswer', tmp);
}

function getInitialOwnedTilesDepth() {
  return settings.initial_owned_tiles_depth;
}

function getInitialMoneyByDifficulty(difficulty) {
  if (difficulty === 'easy') {
    return settings.initial_money;
  } else if (difficulty === 'medium') {
    return Math.ceil(0.5 * settings.initial_money);
  } else {
    return Math.ceil(0.1 * settings.initial_money);
  }
}

function getTileTypeId(name) {
  return tileType[name]?.id ?? null;
}

function getSpawnRadius() {
  return settings.spawn_radius ?? null;
}

function getTilePrice(name) {
  return tileType[name]?.price ?? null;
}

function getPrices(socket) {
  const data = {
    silo: tileType['silo']?.price || 0,
    barn: tileType['barn']?.price || 0,
    coldStorage: tileType['coldStorage']?.price || 0,
    waterize: 10,
    fertilize: 20,
    corn: tileType['corn']?.price || 0,
    tomato: tileType['tomato']?.price || 0,
    wheat: tileType['wheat']?.price || 0,
    baseballBat: weaponType['baseballBat']?.price || 0,
    chainsaw: weaponType['chainsaw']?.price || 0,
    ak47: weaponType['ak47']?.price || 0
  };

  socket.emit('getPricesAnswer', data);
}

function getMarketPricesData() {
  return { ...marketPrice };
}

function refreshMarketPrices(socket) {
  const data = {
    corn: marketPrice[tileType['corn']?.id] || 0,
    tomato: marketPrice[tileType['tomato']?.id] || 0,
    wheat: marketPrice[tileType['wheat']?.id] || 0
  };

  socket.emit('refreshMarketPrices', data);
}

function setTileMarketPrice(type, price) {
  if (marketPrice[type] !== undefined) {
    marketPrice[type] = price;
  }
}

function getBuildingRunningCost(name) {
  const tileId = tileType[name]?.id;
  return building[tileId]?.running_cost ?? null;
}

function getBuildingCapacity(name) {
  const tileId = tileType[name]?.id;
  return building[tileId]?.capacity ?? null;
}

function getBuildingSize(name) {
  const tileId = tileType[name]?.id;
  return building[tileId] ? { width: building[tileId].width, height: building[tileId].height } : null;
}

function getBuildingSizeSocket(socket) {
  const data = {
    silo: getBuildingSize('silo'),
    barn: getBuildingSize('barn'),
    coldStorage: getBuildingSize('coldStorage')
  };

  socket.emit('getBuildingSizeAnswer', data);
}

function getWeaponPrice(name) {
  return weaponType[name]?.price ?? null;
}

function getInitialLife() {
  return settings.initial_life ?? 100;
}

function isBuilding(name) {
  const tileId = tileType[name]?.id;
  return building[tileId] !== undefined;
}

function getNaturalEventProbabilities() {
  return { ...naturalEvent };
}

export default {
  init,
  getData,
  getDisplayData,
  getInitialOwnedTilesDepth,
  getInitialMoneyByDifficulty,
  getTileTypeId,
  getSpawnRadius,
  getTilePrice,
  getPrices,
  getMarketPricesData,
  setTileMarketPrice,
  refreshMarketPrices,
  getBuildingRunningCost,
  getBuildingCapacity,
  getBuildingSize,
  getBuildingSizeSocket,
  getWeaponPrice,
  getInitialLife,
  isBuilding,
  getNaturalEventProbabilities
};
