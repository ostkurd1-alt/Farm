import { query } from './db.js';
import map from './map.js';
import infos from './infos.js';
import market from './market.js';
import building from './building.js';
import globalSettings from './settings.js';
import broadcast from './broadcast.js';

const plantData = {};

async function init() {
  try {
    const rows = await query(`
      SELECT c.id_crop, c.maturity, c.health, c.maturated, t.xpos, t.ypos, t.fertility, t.humidity
      FROM wof_crop c
      LEFT JOIN wof_tile t ON (c.id_crop = t.crop)
    `);

    for (const row of rows) {
      plantData[row.id_crop] = {
        fertility: row.fertility,
        humidity: row.humidity,
        maturity: row.maturity,
        health: row.health,
        maturated: row.maturated,
        x: row.xpos,
        y: row.ypos
      };

      if (row.health > 0) {
        const delay = calculMaturation(row.humidity, row.fertility);
        plantData[row.id_crop].timer = setTimeout(() => updatePlant(row.id_crop), delay);
      }
    }

    console.log('Plants initialized');

  } catch (error) {
    console.error('Database error on retrieving crops:', error);
  }
}

function calculMaturation(humidity, fertility) {
  const defaultTime = 10000;
  const average = Math.floor(((humidity + fertility) / 2) * 100);

  if (average >= 80) return defaultTime;
  if (average >= 60) return defaultTime * 1.2;
  if (average >= 40) return defaultTime * 1.4;
  if (average >= 20) return defaultTime * 1.6;
  return defaultTime * 1.8;
}

function plantAdd(socket, data) {
  if (data.x === undefined || data.y === undefined || data.type === undefined) {
    socket.emit('error', { error: 'Server unable to plant this plant' });
    return;
  }

  map.getTilesData(socket, {
    x: data.x,
    y: data.y,
    depth_x: 1,
    depth_y: 1,
    type: data.type
  }, plantAddFinalize);
}

async function plantAddFinalize(socket, data) {
  const userId = socket.handshake.user_id;

  if (data.map.length === 0) {
    socket.emit('error', { type: 'plant', error: "You can't plant here" });
    return;
  }

  if (data.map[0].owner !== userId) {
    socket.emit('error', { type: 'plant', error: "This field doesn't belong to you" });
    return;
  }

  if (data.map[0].type !== 'ground') {
    socket.emit('error', { type: 'plant', error: "You can't plant here" });
    return;
  }

  const plantCost = globalSettings.getTilePrice(data.type);
  if (infos.getMoney(userId) < plantCost) {
    socket.emit('error', { type: 'money', error: "You don't have enough money to plant it" });
    return;
  }

  const productivity = Math.floor(Math.random() * 30) + 1;

  try {
    const result = await query(
      'INSERT INTO wof_crop (type, productivity) VALUES (?, ?)',
      [globalSettings.getTileTypeId(data.type), productivity]
    );

    const plantId = result.insertId;

    map.setMapData(data.x, data.y, { type: data.type, id_crop: plantId, productivity });

    await query(
      'UPDATE wof_tile SET type = ?, crop = ? WHERE xpos = ? AND ypos = ?',
      [globalSettings.getTileTypeId(data.type), plantId, data.x, data.y]
    );

    market.buy(socket, userId, plantCost);
    map.refreshMap(socket);

    plantData[plantId] = {
      timer: setTimeout(() => updatePlant(plantId), calculMaturation(data.map[0].humidity, data.map[0].fertility)),
      maturity: 0,
      fertility: data.map[0].fertility,
      humidity: data.map[0].humidity,
      health: 100,
      maturated: null,
      x: data.map[0].xpos,
      y: data.map[0].ypos
    };

    broadcast.refreshViewerMap(data.x, data.y, userId);

  } catch (error) {
    console.error('Database error on creating a crop:', error);
    socket.emit('error', { type: 'plant', error: 'An error occurred while planting it' });
  }
}

async function updatePlant(plantId) {
  const plant = plantData[plantId];
  if (!plant) return;

  if (plant.maturity < 100) {
    plant.maturity++;
  }

  if (plant.humidity > 0) {
    plant.humidity = Math.max(0, Math.round(plant.humidity * 100 - 1) / 100);
  }

  if (plant.fertility > 0) {
    plant.fertility = Math.max(0, Math.round(plant.fertility * 100 - 1) / 100);
  }

  if (plant.humidity === 0 && plant.fertility === 0 && plant.health > 0) {
    plant.health--;
  }

  if (plant.maturity === 100) {
    if (!plant.maturated) {
      plant.maturated = new Date();
    } else {
      const witheringDelay = 24 * 60 * 60 * 1000; // 1 day
      if (Date.now() - plant.maturated.getTime() > witheringDelay) {
        plant.health = 0;
      }
    }
  }

  map.setMapData(plant.x, plant.y, {
    humidity: plant.humidity,
    fertility: plant.fertility,
    maturity: plant.maturity,
    health: plant.health,
    maturated: plant.maturated
  });

  // Notify viewers on milestone changes
  if ([10, 30, 60, 80, 100].includes(plant.maturity) || plant.health === 0) {
    broadcast.refreshViewerMap(plant.x, plant.y);
  }

  try {
    await query(
      'UPDATE wof_crop SET maturity = ?, health = ?, maturated = ? WHERE id_crop = ?',
      [plant.maturity, plant.health, plant.maturated, plantId]
    );

    await query(
      'UPDATE wof_tile SET humidity = ?, fertility = ? WHERE xpos = ? AND ypos = ?',
      [plant.humidity, plant.fertility, plant.x, plant.y]
    );
  } catch (error) {
    console.error('Database error on updating plant:', error);
  }

  if (plant.health > 0) {
    plant.timer = setTimeout(() => updatePlant(plantId), calculMaturation(plant.humidity, plant.fertility));
  }
}

function harvest(socket, data) {
  if (data.x === undefined || data.y === undefined) {
    socket.emit('error', { error: 'Server unable to harvest this plant' });
    return;
  }

  map.getTilesData(socket, {
    x: data.x,
    y: data.y,
    depth_x: 1,
    depth_y: 1,
    type: data.type
  }, harvestAuthorization);
}

async function harvestAuthorization(socket, data) {
  const tile = data.map[0];
  const validTypes = ['tomato', 'corn', 'wheat'];

  if (!validTypes.includes(tile?.type)) {
    socket.emit('error', { type: 'plant', error: "You can't harvest this!" });
    return;
  }

  if (tile.owner !== data.user_id) {
    socket.emit('error', { type: 'plant', error: "You don't have the right to harvest this plant" });
    return;
  }

  if (tile.maturity <= 80) {
    socket.emit('error', { type: 'plant', error: "This plant is not enough mature to be harvested" });
    return;
  }

  if (tile.health === 0) {
    socket.emit('error', { type: 'plant', error: "This plant is withered.. You should destruct it" });
    return;
  }

  globalSettings.refreshMarketPrices(socket);
  socket.emit('harvestQuestion', {
    building: {},
    amount: tile.productivity,
    type: tile.type,
    x: tile.xpos,
    y: tile.ypos
  });
}

function deleteCrop(socket, data) {
  if (data.x === undefined || data.y === undefined) {
    socket.emit('error', { error: 'Server unable to remove this plant' });
    return;
  }

  map.getTilesData(socket, { x: data.x, y: data.y, depth_x: 1, depth_y: 1 }, deleteCropFinalize);
}

async function deleteCropFinalize(socket, data) {
  const userId = socket.handshake.user_id;
  const tile = data.map[0];
  const validTypes = ['tomato', 'corn', 'wheat'];

  if (!validTypes.includes(tile?.type)) {
    socket.emit('error', { type: 'plant', error: "You can't remove this!" });
    return;
  }

  if (tile.owner !== userId) {
    socket.emit('error', { type: 'plant', error: "You don't have the right to remove this plant" });
    return;
  }

  try {
    await query('DELETE FROM wof_crop WHERE id_crop = ?', [tile.id_crop]);

    destruct(tile.id_crop);
    map.refreshMap(socket);
    broadcast.refreshViewerMap(data.x, data.y, userId);

  } catch (error) {
    console.error('Database error on deleting crop:', error);
    socket.emit('error', { type: 'plant', error: 'An error occurred while removing this plant' });
  }
}

function destruct(cropId) {
  const plant = plantData[cropId];
  if (plant) {
    if (plant.timer) clearTimeout(plant.timer);
    map.setMapData(plant.x, plant.y, { type: 'ground', id_crop: null, maturated: null, productivity: 1, maturity: 0, health: 100 });
    plantData[cropId] = undefined;
  }
}

async function fertilize(socket, data) {
  if (data.x === undefined || data.y === undefined) {
    socket.emit('error', { error: 'Server unable to fertilize this plant' });
    return;
  }

  map.getTilesData(socket, { x: data.x, y: data.y, depth_x: 1, depth_y: 1, type: data.type }, fertilizeFinalize);
}

async function fertilizeFinalize(socket, data) {
  const userId = socket.handshake.user_id;
  const cost = 5;
  const tile = data.map[0];

  if (tile.owner !== userId) {
    socket.emit('error', { type: 'plant', error: "You don't have the right to fertilize this plant" });
    return;
  }

  if (infos.getMoney(userId) < cost) {
    socket.emit('error', { type: 'money', error: "You don't have enough money to fertilize it" });
    return;
  }

  const newFertility = Math.min(1, Math.round(tile.fertility * 100 + 20) / 100);
  map.setMapData(data.x, data.y, { fertility: newFertility });

  if (tile.id_crop && plantData[tile.id_crop]) {
    plantData[tile.id_crop].fertility = newFertility;
  }

  try {
    await query('UPDATE wof_tile SET fertility = ? WHERE xpos = ? AND ypos = ?', [newFertility, data.x, data.y]);
    market.buy(socket, userId, cost);
  } catch (error) {
    console.error('Database error on fertilizing:', error);
    socket.emit('error', { type: 'plant', error: 'An error occurred while fertilizing it' });
  }
}

async function waterize(socket, data) {
  if (data.x === undefined || data.y === undefined) {
    socket.emit('error', { error: 'Server unable to waterize this plant' });
    return;
  }

  map.getTilesData(socket, { x: data.x, y: data.y, depth_x: 1, depth_y: 1, type: data.type }, waterizeFinalize);
}

async function waterizeFinalize(socket, data) {
  const userId = socket.handshake.user_id;
  const cost = 5;
  const tile = data.map[0];

  if (tile.owner !== userId) {
    socket.emit('error', { type: 'plant', error: "You don't have the right to waterize this plant" });
    return;
  }

  if (infos.getMoney(userId) < cost) {
    socket.emit('error', { type: 'money', error: "You don't have enough money to waterize it" });
    return;
  }

  const newHumidity = Math.min(1, Math.round(tile.humidity * 100 + 20) / 100);
  map.setMapData(data.x, data.y, { humidity: newHumidity });

  if (tile.id_crop && plantData[tile.id_crop]) {
    plantData[tile.id_crop].humidity = newHumidity;
  }

  try {
    await query('UPDATE wof_tile SET humidity = ? WHERE xpos = ? AND ypos = ?', [newHumidity, data.x, data.y]);
    market.buy(socket, userId, cost);
  } catch (error) {
    console.error('Database error on waterizing:', error);
    socket.emit('error', { type: 'plant', error: 'An error occurred while waterizing it' });
  }
}

async function harvestDistribution(socket, data) {
  const userId = socket.handshake.user_id;

  if (!data.x || !data.y || !data.buildingId || !data.amount || !data.type) {
    socket.emit('error', { type: 'plant', error: 'Invalid harvest distribution data' });
    return;
  }

  try {
    const buildingRows = await query(
      'SELECT b.id_building, b.owner, bs.capacity, COALESCE(SUM(bc.amount), 0) as stored FROM wof_building b LEFT JOIN wof_building_settings bs ON b.type = bs.type LEFT JOIN wof_building_crop bc ON b.id_building = bc.id_building WHERE b.id_building = ? GROUP BY b.id_building',
      [data.buildingId]
    );

    if (buildingRows.length === 0) {
      socket.emit('error', { type: 'plant', error: 'Building not found' });
      return;
    }

    const building = buildingRows[0];

    if (building.owner !== userId) {
      socket.emit('error', { type: 'plant', error: "This building doesn't belong to you" });
      return;
    }

    if (building.stored + data.amount > building.capacity) {
      socket.emit('error', { type: 'plant', error: 'Not enough capacity in building' });
      return;
    }

    const tileRows = await query(
      'SELECT t.xpos, t.ypos, t.owner, t.crop, c.type as crop_type FROM wof_tile t LEFT JOIN wof_crop c ON t.crop = c.id_crop WHERE t.xpos = ? AND t.ypos = ?',
      [data.x, data.y]
    );

    if (tileRows.length === 0 || !tileRows[0].crop) {
      socket.emit('error', { type: 'plant', error: 'No crop found at this location' });
      return;
    }

    const tile = tileRows[0];

    if (tile.owner !== userId) {
      socket.emit('error', { type: 'plant', error: "You don't have the right to harvest this plant" });
      return;
    }

    const cropTypeId = globalSettings.getTileTypeId(data.type);

    await query(
      'INSERT INTO wof_building_crop (id_building, type, amount) VALUES (?, ?, ?)',
      [data.buildingId, cropTypeId, data.amount]
    );

    await query('DELETE FROM wof_crop WHERE id_crop = ?', [tile.crop]);

    destruct(tile.crop);
    map.setMapData(tile.xpos, tile.ypos, { type: 'ground', id_crop: null, maturated: null, productivity: 1, maturity: 0, health: 100 });

    await query(
      'UPDATE wof_tile SET type = ?, crop = NULL WHERE xpos = ? AND ypos = ?',
      [globalSettings.getTileTypeId('ground'), tile.xpos, tile.ypos]
    );

    map.refreshMap(socket);
    broadcast.refreshViewerMap(tile.xpos, tile.ypos, userId);

    console.log(`Harvest distributed: ${data.amount} ${data.type} to building ${data.buildingId}`);

  } catch (error) {
    console.error('Database error on harvest distribution:', error);
    socket.emit('error', { type: 'plant', error: 'An error occurred while distributing harvest' });
  }
}

export default {
  init,
  plantAdd,
  plantAddFinalize,
  harvest,
  harvestAuthorization,
  harvestDistribution,
  deleteCrop,
  deleteCropFinalize,
  destruct,
  fertilize,
  fertilizeFinalize,
  waterize,
  waterizeFinalize
};
