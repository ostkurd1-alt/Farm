import { query } from './db.js';
import character from './character.js';
import infos from './infos.js';
import globalSettings from './settings.js';

import Tile from './class/tile.js';
import Ground from './class/ground.js';
import Water from './class/water.js';
import Corn from './class/corn.js';
import Tomato from './class/tomato.js';
import Wheat from './class/wheat.js';
import Barn from './class/barn.js';
import ColdStorage from './class/coldStorage.js';
import Silo from './class/silo.js';

const mapData = {};

async function init() {
  console.log('Starting to load map tiles in memory...');

  try {
    const rows = await query('SELECT * FROM wof_tile_informations ORDER BY xpos, ypos');

    for (const row of rows) {
      setMapData(row.xpos, row.ypos, row);
    }

    console.log(`${rows.length} map tiles successfully loaded in memory!`);

  } catch (error) {
    console.error('Database error on retrieving map tiles:', error);
    process.exit(1);
  }
}

function setMapData(x, y, data) {
  const xNum = parseInt(x);
  const yNum = parseInt(y);

  if (!mapData[xNum]) {
    mapData[xNum] = {};
  }

  if (!mapData[xNum][yNum]) {
    mapData[xNum][yNum] = {
      xpos: null,
      ypos: null,
      type: 'ground',
      humidity: 0,
      fertility: 0,
      maturity: 0,
      health: 100,
      productivity: 1,
      maturated: null,
      id_crop: null,
      id_building: null,
      owner: null,
      id_alliance: null
    };
  }

  if (data.xpos !== undefined) mapData[xNum][yNum].xpos = data.xpos;
  if (data.ypos !== undefined) mapData[xNum][yNum].ypos = data.ypos;
  if (data.type !== undefined) mapData[xNum][yNum].type = data.type;
  if (data.humidity !== undefined) mapData[xNum][yNum].humidity = data.humidity;
  if (data.fertility !== undefined) mapData[xNum][yNum].fertility = data.fertility;
  if (data.maturity !== undefined) mapData[xNum][yNum].maturity = data.maturity;
  if (data.health !== undefined) mapData[xNum][yNum].health = data.health;
  if (data.productivity !== undefined) mapData[xNum][yNum].productivity = data.productivity;
  if (data.maturated !== undefined) mapData[xNum][yNum].maturated = data.maturated;
  if (data.id_crop !== undefined) mapData[xNum][yNum].id_crop = data.id_crop;
  if (data.id_building !== undefined) mapData[xNum][yNum].id_building = data.id_building;
  if (data.owner !== undefined) mapData[xNum][yNum].owner = data.owner;
  if (data.id_alliance !== undefined) mapData[xNum][yNum].id_alliance = data.id_alliance;
}

function getMapRawData(x, y) {
  const xNum = parseInt(x);
  const yNum = parseInt(y);

  if (!mapData[xNum] || !mapData[xNum][yNum]) {
    return null;
  }
  return { ...mapData[xNum][yNum] };
}

function createElementFromType(typeName, data) {
  const classMap = {
    ground: Ground,
    water: Water,
    corn: Corn,
    tomato: Tomato,
    wheat: Wheat,
    barn: Barn,
    coldStorage: ColdStorage,
    silo: Silo
  };

  const ClassRef = classMap[typeName];
  if (ClassRef) {
    return new ClassRef(data);
  }
  return new Ground(data);
}

function getMapData(x, y, data) {
  const xNum = parseInt(x);
  const yNum = parseInt(y);

  if (!mapData[xNum] || !mapData[xNum][yNum]) {
    return null;
  }

  const tile = mapData[xNum][yNum];
  const element = createElementFromType(tile.type, {
    maturity: tile.maturity,
    health: tile.health,
    maturated: tile.maturated,
    id_building: tile.id_building
  });

  return new Tile(
    tile.xpos,
    tile.ypos,
    parseInt(tile.xpos - data.x),
    parseInt(tile.ypos - data.y),
    tile.humidity,
    tile.fertility,
    element,
    declareOwnership(data.user_id, data.alliance, tile.owner, tile.id_alliance)
  );
}

function validateUserId(userId) {
  return userId !== undefined && userId !== null && Number.isInteger(Number(userId));
}

function validateAngle(angle) {
  return /^[0-3]$/.test(String(angle));
}

function validatePosition(x, y) {
  return x !== undefined && Number.isInteger(Number(x)) &&
         y !== undefined && Number.isInteger(Number(y));
}

function declareOwnership(user_id, user_alliance_id, owner, alliance_id) {
  if (owner === null) return 'neutral';
  if (owner === user_id) return 'own';
  if (alliance_id === null) return 'enemy';
  if (alliance_id === user_alliance_id) return 'allies';
  return 'enemy';
}

function rotate90(map) {
  const result = [];
  for (let i = 0; i < map.length; i++) {
    let k = 0;
    for (let j = map[i].length - 1; j >= 0; j--) {
      if (!result[k]) result[k] = [];
      result[k++][i] = map[i][j];
    }
  }
  return result;
}

function rotate180(map) {
  const result = [];
  let k = 0;
  for (let i = map.length - 1; i >= 0; i--) {
    result[k] = [];
    let l = 0;
    for (let j = map[i].length - 1; j >= 0; j--) {
      result[k][l++] = map[i][j];
    }
    k++;
  }
  return result;
}

function rotate270(map) {
  const result = [];
  let k = 0;
  for (let i = map.length - 1; i >= 0; i--) {
    let l = 0;
    for (let j = 0; j < map[i].length; j++) {
      if (!result[l]) result[l] = [];
      result[l++][k] = map[i][j];
    }
    k++;
  }
  return result;
}

function applyPerspective(map, angle) {
  for (let i = 0; i < map.length; i++) {
    for (let j = 0; j < map[i].length; j++) {
      if (map[i][j]?.element?.type === 'barn') {
        map[i][j].element.type = 'barn-part-0';
        // Apply barn perspective logic...
      } else if (map[i][j]?.element?.type === 'coldStorage') {
        map[i][j].element.type = 'coldStorage-part-0';
        // Apply cold storage perspective logic...
      }
    }
  }
  return map;
}

function getMap(socket, data, fallback, handshake) {
  data.user_id = socket.handshake.user_id;

  if (!validateUserId(data.user_id)) {
    socket.emit('error', { invalidSession: true });
    return;
  }

  if (data.angle === undefined || !validateAngle(data.angle)) {
    if (!fallback) {
      socket.emit('getMapAnswer', { error: 'Invalid angle' });
      return;
    }
    fallback(socket, data, { error: 'Invalid angle' });
    return;
  }

  if (!validatePosition(data.x, data.y)) {
    if (!fallback) {
      socket.emit('getMapAnswer', { error: 'Invalid position' });
      return;
    }
    fallback(socket, data, { error: 'Invalid position' });
    return;
  }

  const depth_x = parseInt(data.depth_x) || 1;
  const depth_y = parseInt(data.depth_y) || 1;

  if (handshake !== undefined && !fallback) {
    infos.setMapData(data.user_id, {
      min_x: data.x,
      min_y: data.y,
      max_x: data.x + depth_x,
      max_y: data.y + depth_y,
      angle: data.angle
    });
    character.sendCharacterDisplay(socket, data.user_id);
    character.getOtherCharacterDisplay(socket, data.user_id, {
      min_x: data.x,
      min_y: data.y,
      max_x: data.x + depth_x,
      max_y: data.y + depth_y,
      angle: data.angle
    });
  }

  if (!fallback) {
    data.x -= (depth_x - 1) / 2;
    data.y -= (depth_y - 1) / 2;
  }

  data.alliance = infos.getAlliance(data.user_id);

  const map = [];
  const toGenerate = [];
  const startX = parseInt(data.x);
  const startY = parseInt(data.y);

  for (let i = startX; i < startX + depth_x; i++) {
    map[i - startX] = [];
    for (let j = startY; j < startY + depth_y; j++) {
      map[i - startX][j - startY] = getMapData(i, j, data);

      if (map[i - startX][j - startY] === null) {
        toGenerate.push({ x: i, y: j });
      }
    }
  }

  if (toGenerate.length > 0) {
    generateMapSync(data.x, data.y, map, toGenerate);
  }

  let rotatedMap = map;
  if (data.angle == 1) rotatedMap = rotate90(map);
  else if (data.angle == 2) rotatedMap = rotate180(map);
  else if (data.angle == 3) rotatedMap = rotate270(map);

  if (!fallback) {
    rotatedMap = applyPerspective(rotatedMap, data.angle);
    socket.emit('getMapAnswer', { map: rotatedMap });
  } else {
    fallback(socket, data, rotatedMap);
  }
}

function generateMapSync(mapX, mapY, map, toGenerate) {
  for (const tile of toGenerate) {
    const elementType = isWater(tile.x - mapX, tile.y - mapY, map) ? 'water' : 'ground';

    setMapData(tile.x, tile.y, {
      xpos: tile.x,
      ypos: tile.y,
      type: elementType,
      humidity: null,
      fertility: null,
      maturity: 0,
      health: 100,
      maturated: null,
      id_building: null,
      owner: null,
      id_alliance: null
    });

    map[tile.x - mapX][tile.y - mapY] = getMapData(tile.x, tile.y, { x: mapX, y: mapY });
  }

  // Save to database asynchronously
  saveGeneratedTiles(mapX, mapY, map, toGenerate);
}

async function saveGeneratedTiles(mapX, mapY, map, toGenerate) {
  if (toGenerate.length === 0) return;

  const values = [];
  for (const tile of toGenerate) {
    const tileData = map[tile.x - mapX]?.[tile.y - mapY];
    if (tileData) {
      const typeId = globalSettings.getTileTypeId(tileData.element?.type || 'ground');
      values.push([typeId, tileData.mapX, tileData.mapY, tileData.humidity || 0, tileData.fertility || 0]);

      setMapData(tileData.mapX, tileData.mapY, {
        humidity: tileData.humidity,
        fertility: tileData.fertility
      });
    }
  }

  if (values.length > 0) {
    try {
      await query(
        'INSERT INTO wof_tile (type, xpos, ypos, humidity, fertility) VALUES ? ON DUPLICATE KEY UPDATE id_tile=id_tile',
        [values]
      );
    } catch (error) {
      console.error('Database error on inserting new tiles:', error);
    }
  }
}

function isWater(i, j, map) {
  const x = Math.floor(Math.random() * 100);
  let proba = 0;
  const coefficient = 30;

  if (i > 0 && map[i - 1]?.[j]?.element?.type === 'water') {
    proba += coefficient;
  }
  if (j >= 1 && map[i]?.[j - 1]?.element?.type === 'water') {
    proba += coefficient;
  }
  if (i >= 1 && j >= 1 && map[i - 1]?.[j - 1]?.element?.type === 'water') {
    proba += coefficient / 2;
  }

  return x - proba < 1;
}

async function getPosition(socket) {
  const userId = socket.handshake.user_id;

  if (!validateUserId(userId)) {
    socket.emit('error', { invalidSession: true });
    return;
  }

  try {
    const rows = await query(
      'SELECT map_x, map_y, user_x, user_y, angle FROM wof_user_position WHERE id_user = ? LIMIT 1',
      [userId]
    );

    if (rows.length === 0) {
      socket.emit('getPositionAnswer', { error: 'No position available' });
      return;
    }

    const pos = rows[0];
    infos.setCharacterData(userId, {
      x: pos.user_x,
      y: pos.user_y,
      previous_x: pos.user_x,
      previous_y: pos.user_y,
      angle: 1
    });
    infos.setMapAngle(userId, pos.angle);

    socket.emit('getPositionAnswer', {
      map_x: pos.map_x,
      map_y: pos.map_y,
      user_x: pos.user_x,
      user_y: pos.user_y,
      angle: pos.angle
    });

  } catch (error) {
    console.error('Database error on retrieving position:', error);
    socket.emit('getPositionAnswer', { error: 'Database error on retrieving position' });
  }
}

async function updateMapPosition(socket, data) {
  const userId = socket.handshake.user_id;

  if (!validateUserId(userId)) {
    socket.emit('error', { invalidSession: true });
    return;
  }

  if (!validatePosition(data.x, data.y)) {
    socket.emit('error', { error: 'Invalid map position' });
    return;
  }

  infos.updateMapPosition(userId, { x: data.x, y: data.y });

  try {
    await query(
      'UPDATE wof_user_position SET map_x = ?, map_y = ? WHERE id_user = ?',
      [data.x, data.y, userId]
    );
  } catch (error) {
    console.error('Database error on updating map position:', error);
    socket.emit('error', { error: 'Database error on updating map position' });
  }
}

async function allocateTerritory(userId, res) {
  try {
    const corner = Math.floor(Math.random() * 10) % 4;
    const orderConditions = [
      't.ypos ASC, t.xpos ASC',
      't.ypos ASC, t.xpos DESC',
      't.ypos DESC, t.xpos DESC',
      't.ypos DESC, t.xpos ASC'
    ];
    const condition = orderConditions[corner];

    const cornerRows = await query(
      `SELECT t.xpos, t.ypos FROM wof_tile t WHERE t.owner IS NOT NULL ORDER BY ${condition} LIMIT 1`
    );

    let position = { x: 0, y: 0 };
    if (cornerRows.length > 0) {
      position = { x: cornerRows[0].xpos, y: cornerRows[0].ypos };
    }

    const radius = globalSettings.getSpawnRadius();
    const initialDepth = globalSettings.getInitialOwnedTilesDepth();

    const territoryRows = await query(
      'SELECT * FROM wof_tile_informations WHERE xpos >= ? AND xpos < ? AND ypos >= ? AND ypos < ? ORDER BY xpos, ypos',
      [position.x - radius, position.x + radius, position.y - radius, position.y + radius]
    );

    const depth = radius * 2 + 1;
    const map = Array.from({ length: depth }, () => Array(depth).fill(null));
    const mapOwner = Array.from({ length: depth }, () => Array(depth).fill(null));

    for (const row of territoryRows) {
      const i = row.xpos - position.x + radius;
      const j = row.ypos - position.y + radius;

      mapOwner[i][j] = row.owner;
      map[i][j] = new Tile(
        row.xpos,
        row.ypos,
        i,
        j,
        row.humidity,
        row.fertility,
        createElementFromType(row.type, {
          maturity: row.maturity,
          health: row.health,
          maturated: row.maturated,
          id_building: row.id_building
        }),
        null
      );
    }

    // Find spawn position
    let spawnPosition = null;
    const abstractPosition = { x: 0, y: 0 };

    // Simplified spawn logic
    for (let dx = 0; dx < initialDepth && !spawnPosition; dx++) {
      for (let dy = 0; dy < initialDepth && !spawnPosition; dy++) {
        if (!mapOwner[dx + radius - initialDepth]?.[dy + radius - initialDepth]) {
          spawnPosition = {
            x: position.x - radius + dx,
            y: position.y - radius + dy
          };
          abstractPosition.x = dx + radius - initialDepth;
          abstractPosition.y = dy + radius - initialDepth;
        }
      }
    }

    if (!spawnPosition) {
      spawnPosition = { x: position.x - radius, y: position.y - radius };
      abstractPosition.x = 0;
      abstractPosition.y = 0;
    }

    // Create user position
    await query(
      'INSERT INTO wof_user_position (id_user, map_x, map_y, user_x, user_y, angle) VALUES (?, ?, ?, ?, ?, 0)',
      [userId, spawnPosition.x, spawnPosition.y, spawnPosition.x, spawnPosition.y]
    );

    // Assign tiles to user
    for (let i = spawnPosition.x; i < spawnPosition.x + initialDepth; i++) {
      for (let j = spawnPosition.y; j < spawnPosition.y + initialDepth; j++) {
        setMapData(i, j, { owner: userId });
      }
    }

    await query(
      'UPDATE wof_tile SET owner = ? WHERE xpos >= ? AND xpos < ? AND ypos >= ? AND ypos < ?',
      [userId, spawnPosition.x, spawnPosition.x + initialDepth, spawnPosition.y, spawnPosition.y + initialDepth]
    );

    res.redirect('/play');

  } catch (error) {
    console.error('Territory allocation error:', error);
    res.redirect('/play');
  }
}

function getTilesData(socket, data, callback) {
  data.user_id = socket.handshake.user_id;

  if (!validateUserId(data.user_id)) {
    socket.emit('error', { invalidSession: true });
    return;
  }

  data.angle = infos.getMapAngle(data.user_id);
  data.condition = {
    min_x: parseInt(data.x) - (data.depth_x - 1),
    max_x: parseInt(data.x) + 1,
    min_y: parseInt(data.y) - (data.depth_y - 1),
    max_y: parseInt(data.y) + 1
  };
  data.map = [];

  for (let i = data.condition.min_x; i < data.condition.max_x; i++) {
    for (let j = data.condition.min_y; j < data.condition.max_y; j++) {
      data.map.push(getMapRawData(i, j));
    }
  }

  callback(socket, data);
}

function getTileInformations(socket, data) {
  data.user_id = socket.handshake.user_id;

  if (!validateUserId(data.user_id)) {
    socket.emit('error', { invalidSession: true });
    return;
  }

  if (!validatePosition(data.x, data.y)) {
    socket.emit('error', { error: 'Server unable to find informations about this tile' });
    return;
  }

  const informations = getMapRawData(data.x, data.y);

  if (informations === null) {
    socket.emit('error', { error: 'Server unable to find informations about this tile' });
  } else {
    socket.emit('getTileInformationsAnswer', informations);
  }
}

function refreshMap(socket) {
  const userId = socket.handshake.user_id;

  if (!validateUserId(userId)) return;

  const data = infos.getMapData(userId);
  if (!data) return;

  getMap(socket, {
    depth_x: data.max_x - data.min_x,
    depth_y: data.max_y - data.min_y,
    x: data.min_x,
    y: data.min_y,
    angle: data.angle
  });
}

export default {
  init,
  getMap,
  refreshMap,
  getPosition,
  updateMapPosition,
  allocateTerritory,
  getTilesData,
  setMapData,
  getMapRawData,
  getTileInformations
};
