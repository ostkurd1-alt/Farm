import { query } from './db.js';
import globalSettings from './settings.js';

const userData = {};

function initData(userId, email) {
  userData[userId] = {
    id: userId,
    email: email,
    life: null,
    life_max: null,
    money: null,
    tiles_owned: null,
    level: null,
    alliance: null,
    map: {
      min_x: null,
      min_y: null,
      max_x: null,
      max_y: null,
      angle: null
    },
    character: {
      x: null,
      y: null,
      previous_x: null,
      previous_y: null,
      shift_x: 0,
      shift_y: 0,
      angle: 0,
      leg: 1
    },
    weapon: {
      fork: false,
      baseballBat: false,
      chainsaw: false,
      ak47: false
    }
  };
}

function validateUserId(userId) {
  return userId !== undefined && userId !== null && Number.isInteger(Number(userId));
}

function setMapData(userId, mapData) {
  if (!userData[userId]) return;
  Object.assign(userData[userId].map, mapData);
}

function updateMapPosition(userId, mapData) {
  if (!userData[userId]) return;
  const current = userData[userId].map;
  current.max_x = mapData.x + (current.max_x - current.min_x);
  current.max_y = mapData.y + (current.max_y - current.min_y);
  current.min_x = mapData.x;
  current.min_y = mapData.y;
}

function setMapAngle(userId, angle) {
  if (!userData[userId]) return;
  userData[userId].map.angle = angle;
}

function setCharacterData(userId, characterData) {
  if (!userData[userId]) return;
  const char = userData[userId].character;
  char.x = characterData.x;
  char.y = characterData.y;
  char.previous_x = characterData.previous_x;
  char.previous_y = characterData.previous_y;
  char.shift_x = characterData.shift_x ?? 0;
  char.shift_y = characterData.shift_y ?? 0;
  char.angle = characterData.angle ?? 1;
  char.leg = characterData.leg ?? 1;
}

function setCharacterPosition(userId, x, y) {
  if (!userData[userId]) return;
  userData[userId].character.x = x;
  userData[userId].character.y = y;
  resetCharacterShift(userId);
}

function resetCharacterShift(userId) {
  if (!userData[userId]) return;
  userData[userId].character.shift_x = 0;
  userData[userId].character.shift_y = 0;
}

function updateCharacterShift(userId, x, y) {
  if (!userData[userId]) return;
  userData[userId].character.shift_x += x;
  userData[userId].character.shift_y += y;
}

function setCharacterLeg(userId, leg) {
  if (!userData[userId]) return;
  userData[userId].character.leg = leg;
}

function updateCharacterLeg(userId) {
  if (!userData[userId]) return;
  userData[userId].character.leg = (userData[userId].character.leg + 1) % 4;
}

function setCharacterAngle(userId, angle) {
  if (!userData[userId]) return;
  userData[userId].character.angle = angle;
}

function getData(userId) {
  return userData[userId] ?? null;
}

function getMapData(userId) {
  return userData[userId]?.map ?? null;
}

function getMapAngle(userId) {
  return userData[userId]?.map?.angle ?? null;
}

function getCharacterData(userId) {
  return userData[userId]?.character ?? null;
}

function getEmail(userId) {
  return userData[userId]?.email ?? null;
}

async function getInformations(socket) {
  const userId = socket.handshake.user_id;

  if (!validateUserId(userId)) {
    socket.emit('error', { invalidSession: true });
    return;
  }

  try {
    const rows = await query(
      'SELECT * FROM wof_user_informations WHERE id_user = ? LIMIT 1',
      [userId]
    );

    if (rows.length === 0) {
      socket.emit('getInformationsAnswer', { error: 'No informations available' });
      return;
    }

    if (userData[userId]) {
      userData[userId].life = rows[0].life;
      userData[userId].money = rows[0].money;
      userData[userId].tiles_owned = rows[0].tiles_owned;
      userData[userId].alliance = rows[0].id_alliance;
      determineLevel(userId, rows[0].tiles_owned);

      socket.emit('getInformationsAnswer', {
        life_max: userData[userId].life_max,
        life: rows[0].life,
        money: rows[0].money,
        level: userData[userId].level
      });
    }

  } catch (error) {
    console.error('Database error on retrieving informations:', error);
    socket.emit('getInformationsAnswer', { error: 'Database error on retrieving informations' });
  }
}

async function getOwnedWeapon(socket) {
  const userId = socket.handshake.user_id;

  if (!validateUserId(userId)) {
    socket.emit('error', { invalidSession: true });
    return;
  }

  try {
    const rows = await query(
      'SELECT w.name FROM wof_user_weapon uw LEFT JOIN wof_weapon_type w ON (uw.id_weapon_type = w.id_weapon_type) WHERE uw.id_user = ?',
      [userId]
    );

    if (userData[userId]) {
      for (const row of rows) {
        userData[userId].weapon[row.name] = true;
      }
      socket.emit('getOwnedWeaponAnswer', userData[userId].weapon);
    }

  } catch (error) {
    console.error('Database error on retrieving owned weapons:', error);
    socket.emit('getOwnedWeaponAnswer', { error: 'Database error on retrieving owned weapons' });
  }
}

function determineLevel(userId, total) {
  if (!userData[userId]) return;

  const initialOwnedTilesDepth = globalSettings.getInitialOwnedTilesDepth();
  const level = Math.max(1, Math.ceil((total - (initialOwnedTilesDepth * initialOwnedTilesDepth)) / 20) + 1);

  userData[userId].level = level;
  userData[userId].life_max = level * globalSettings.getInitialLife();
}

function getAlliance(userId) {
  return userData[userId]?.alliance ?? null;
}

function getMoney(userId) {
  return userData[userId]?.money ?? 0;
}

function decreaseMoney(socket, userId, amount) {
  if (!userData[userId]) return;
  userData[userId].money -= amount;
  notifyMoneyChange(socket, userId);
}

function increaseMoney(socket, userId, amount) {
  if (!userData[userId]) return;
  userData[userId].money += amount;
  notifyMoneyChange(socket, userId);
}

function notifyMoneyChange(socket, userId) {
  if (socket && userData[userId]) {
    socket.emit('getInformationsAnswer', {
      life_max: userData[userId].life_max,
      life: userData[userId].life,
      money: userData[userId].money,
      level: userData[userId].level
    });
  }
}

export default {
  initData,
  setMapData,
  setMapAngle,
  setCharacterData,
  setCharacterPosition,
  resetCharacterShift,
  updateCharacterShift,
  setCharacterLeg,
  updateCharacterLeg,
  setCharacterAngle,
  getData,
  getMapData,
  getMapAngle,
  getCharacterData,
  getEmail,
  getInformations,
  getAlliance,
  getMoney,
  decreaseMoney,
  increaseMoney,
  getOwnedWeapon,
  updateMapPosition
};
