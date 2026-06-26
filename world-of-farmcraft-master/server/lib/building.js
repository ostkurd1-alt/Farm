import { query } from './db.js';
import map from './map.js';
import infos from './infos.js';
import market from './market.js';
import globalSettings from './settings.js';
import broadcast from './broadcast.js';

const buildingData = {};

async function init() {
  try {
    const rows = await query('SELECT * FROM wof_building_informations ORDER BY id_building ASC');

    for (const row of rows) {
      buildingData[row.id_building] = {
        type: row.type,
        x: row.x,
        y: row.y,
        crop_stored: row.crop_stored,
        capacity: row.capacity,
        owner: row.owner,
        crop: []
      };
    }

    const cropRows = await query('SELECT * FROM wof_building_crop ORDER BY id_building ASC, stored ASC');

    for (const row of cropRows) {
      if (buildingData[row.id_building]?.type === 'coldStorage') continue;
      setCropTimer(row.id_building_crop, row.id_building, row.stored);
    }

    console.log('Buildings initialized');

  } catch (error) {
    console.error('Database error on retrieving building informations:', error);
  }
}

function setCropTimer(cropId, buildingId, stored) {
  const witheringDelay = 3 * 24 * 60 * 60 * 1000; // 3 days
  const storedDate = stored ? new Date(stored) : new Date();
  const delay = storedDate.getTime() + witheringDelay - Date.now();

  if (delay <= 0) {
    removeCrop(cropId, buildingId);
    return;
  }

  setTimeout(() => removeCrop(cropId, buildingId), delay);
}

async function buildingAdd(socket, data) {
  if (data.x === undefined || data.y === undefined || data.type === undefined) {
    socket.emit('error', { error: 'Server unable to construct this building' });
    return;
  }

  const userId = socket.handshake.user_id;
  if (!userId) {
    socket.emit('error', { invalidSession: true });
    return;
  }

  const size = globalSettings.getBuildingSize(data.type);
  if (!size) {
    socket.emit('error', { error: 'Server unable to construct this building' });
    return;
  }

  map.getTilesData(socket, {
    x: data.x,
    y: data.y,
    depth_x: size.width,
    depth_y: size.height,
    type: data.type,
    user_id: userId
  }, buildingAddFinalize);
}

async function buildingAddFinalize(socket, data) {
  const userId = socket.handshake.user_id;
  const BuildingCost = globalSettings.getTilePrice(data.type);

  if (data.map.length < data.depth_x * data.depth_y) {
    socket.emit('error', { type: 'building', error: "You can't build this building here" });
    return;
  }

  for (const tile of data.map) {
    if (!tile || tile.type !== 'ground') {
      socket.emit('error', { type: 'building', error: "The building won't fit here" });
      return;
    }
    if (tile.owner !== userId) {
      socket.emit('error', { type: 'building', error: "This field doesn't belong to you" });
      return;
    }
  }

  if (infos.getMoney(userId) < BuildingCost) {
    socket.emit('error', { type: 'money', error: "You don't have enough money to build it" });
    return;
  }

  try {
    const result = await query(
      'INSERT INTO wof_building (x, y, type, owner) VALUES (?, ?, ?, ?)',
      [data.x, data.y, globalSettings.getTileTypeId(data.type), userId]
    );

    const buildingId = result.insertId;

    // Update map
    for (let i = 0; i < data.depth_x; i++) {
      for (let j = 0; j < data.depth_y; j++) {
        map.setMapData(data.x - i, data.y - j, { type: data.type, id_building: buildingId });
      }
    }

    await query(
      'UPDATE wof_tile SET type = ?, building = ? WHERE xpos >= ? AND xpos < ? AND ypos >= ? AND ypos < ?',
      [globalSettings.getTileTypeId(data.type), buildingId,
       Math.min(data.x, data.x - data.depth_x + 1), Math.max(data.x, data.x - data.depth_x + 1) + data.depth_x,
       Math.min(data.y, data.y - data.depth_y + 1), Math.max(data.y, data.y - data.depth_y + 1) + data.depth_y]
    );

    market.buy(socket, userId, BuildingCost);
    map.refreshMap(socket);

    buildingData[buildingId] = {
      x: data.x,
      y: data.y,
      type: data.type,
      crop_stored: 0,
      capacity: globalSettings.getBuildingCapacity(data.type),
      owner: userId,
      crop: []
    };

    broadcast.refreshViewerMap(data.x, data.y, userId);

  } catch (error) {
    console.error('Database error on creating a building:', error);
    socket.emit('error', { type: 'building', error: 'An error occurred while building it' });
  }
}

async function buildingRemove(socket, data) {
  if (data.x === undefined || data.y === undefined) {
    socket.emit('error', { error: 'Server unable to destruct this building' });
    return;
  }

  map.getTilesData(socket, { x: data.x, y: data.y, depth_x: 1, depth_y: 1 }, buildingRemoveFinalize);
}

async function buildingRemoveFinalize(socket, data) {
  const userId = socket.handshake.user_id;

  if (data.map[0]?.owner !== userId) {
    socket.emit('error', { type: 'building', error: "This field doesn't belong to you" });
    return;
  }

  if (data.map[0]?.id_building === null || !globalSettings.isBuilding(data.map[0].type)) {
    socket.emit('error', { error: "It looks like there's no building here" });
    return;
  }

  try {
    await query('DELETE FROM wof_building WHERE id_building = ?', [data.map[0].id_building]);

    const building = buildingData[data.map[0].id_building];
    if (building) {
      map.setMapData(building.x, building.y, { type: 'ground', id_building: null });
      buildingData[data.map[0].id_building] = null;
    }

    map.refreshMap(socket);
    broadcast.refreshViewerMap(data.x, data.y, userId);

  } catch (error) {
    console.error('Database error on destructing a building:', error);
    socket.emit('error', { type: 'building', error: 'An error occurred while destructing it' });
  }
}

function destruct(buildingId) {
  const building = buildingData[buildingId];
  if (building) {
    if (building.timer) clearInterval(building.timer);
    buildingData[buildingId] = null;
  }
}

async function removeCrop(cropId, buildingId) {
  try {
    await query('DELETE FROM wof_building_crop WHERE id_building_crop = ?', [cropId]);

    if (buildingData[buildingId]?.crop[cropId]) {
      clearTimeout(buildingData[buildingId].crop[cropId].timer);
      buildingData[buildingId].crop[cropId] = null;
    }
  } catch (error) {
    console.error(`Database error on removing crops ${cropId} from building ${buildingId}:`, error);
  }
}

export default {
  init,
  buildingAdd,
  buildingRemove,
  destruct,
  removeCrop
};
