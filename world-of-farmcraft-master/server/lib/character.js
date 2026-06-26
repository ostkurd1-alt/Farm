import { query } from './db.js';
import map from './map.js';
import infos from './infos.js';
import globalSettings from './settings.js';

let io = null;
const currentPath = {};
const currentPathId = {};

function init(socketIo) {
  io = socketIo;
}

function validateUserId(userId) {
  return userId !== undefined && userId !== null && Number.isInteger(Number(userId));
}

async function setCharacterPosition(socket, userId, x, y) {
  if (!validateUserId(userId)) return;

  try {
    await query(
      'UPDATE wof_user_position SET user_x = ?, user_y = ? WHERE id_user = ?',
      [x, y, userId]
    );
    infos.setCharacterPosition(userId, x, y);
  } catch (error) {
    console.error(`Database error on setting position for user ${userId}:`, error);
    socket.emit('error', { error: 'Database error on setting position' });
  }
}

async function moveCharacter(socket, data) {
  const userId = socket.handshake.user_id;

  if (!validateUserId(userId)) {
    socket.emit('error', { invalidSession: true });
    return;
  }

  if (data.map_x === undefined || data.map_y === undefined ||
      !Number.isInteger(Number(data.map_x)) || !Number.isInteger(Number(data.map_y))) {
    socket.emit('error', { error: 'Invalid destination' });
    return;
  }

  const userData = infos.getData(userId);
  if (!userData) {
    socket.emit('error', { invalidSession: true });
    return;
  }

  currentPath[userId] = [];
  currentPathId[userId] = Math.random();

  data.user_id = userId;
  data.margin = data.margin ?? 2;
  data.exploredLastly = data.exploredLastly ?? -1;

  // Call map to get path
  map.getMap(socket, {
    angle: 0,
    depth_x: Math.abs(data.map_x - userData.character.x) + data.margin * 2 + 1,
    depth_y: Math.abs(data.map_y - userData.character.y) + data.margin * 2 + 1,
    x: Math.min(userData.character.x, data.map_x) - data.margin,
    y: Math.min(userData.character.y, data.map_y) - data.margin,
    map_x: data.map_x,
    map_y: data.map_y,
    user_x: userData.character.x,
    user_y: userData.character.y,
    margin: data.margin,
    action: data.action ?? false,
    exploredLastly: data.exploredLastly,
    pathId: currentPathId[userId]
  }, null, false);
}

async function updateAngle(socket, data) {
  const userId = socket.handshake.user_id;

  if (!validateUserId(userId)) {
    socket.emit('error', { invalidSession: true });
    return;
  }

  if (data.angle === undefined || !/^[0-3]$/.test(String(data.angle))) {
    socket.emit('error', { error: 'Invalid angle' });
    return;
  }

  try {
    await query(
      'UPDATE wof_user_position SET angle = ? WHERE id_user = ?',
      [parseInt(data.angle), userId]
    );
    infos.setMapAngle(userId, parseInt(data.angle));
  } catch (error) {
    console.error('Database error while updating angle:', error);
    socket.emit('error', { error: 'Database error while updating angle' });
  }
}

function determineDirectionAndDistance(angle) {
  const settings = globalSettings.getDisplayData();
  const directions = [
    { direction: { x: 0, y: 1 }, distance: settings.tileHeight + settings.tileHeight * 0.1 },
    { direction: { x: 1, y: 0.5 }, distance: settings.tileHeight + settings.tileHeight * 0.1 },
    { direction: { x: 1, y: 0 }, distance: settings.tileWidth + settings.tileHeight * 0.1 },
    { direction: { x: 1, y: -0.5 }, distance: settings.tileHeight + settings.tileHeight * 0.1 },
    { direction: { x: 0, y: -1 }, distance: settings.tileHeight + settings.tileHeight * 0.1 },
    { direction: { x: -1, y: -0.5 }, distance: settings.tileHeight + settings.tileHeight * 0.1 },
    { direction: { x: -1, y: 0 }, distance: settings.tileWidth + settings.tileHeight * 0.1 },
    { direction: { x: -1, y: 0.5 }, distance: settings.tileHeight + settings.tileHeight * 0.1 }
  ];
  return directions[angle] || directions[0];
}

function sendCharacterDisplay(socket, userId) {
  const userData = infos.getData(userId);
  if (!userData) return;

  socket.emit('refreshCharacterDisplay', { user: userData.character });

  if (io) {
    for (const [socketId, otherSocket] of io.sockets.sockets) {
      const otherUserId = otherSocket.handshake?.user_id;
      if (otherUserId && otherUserId !== userId) {
        const viewerData = infos.getMapData(otherUserId);
        if (viewerData) {
          const halfWidth = (viewerData.max_x - viewerData.min_x - 1) / 2;
          const halfHeight = (viewerData.max_y - viewerData.min_y - 1) / 2;

          if (userData.character.x >= viewerData.min_x - halfWidth &&
              userData.character.x <= viewerData.max_x &&
              userData.character.y >= viewerData.min_y - halfHeight &&
              userData.character.y <= viewerData.max_y) {
            otherSocket.emit('refreshOtherCharactersDisplay', {
              user_id: userId,
              email: userData.email,
              infos: userData.character
            });
          }
        }
      }
    }
  }
}

function getOtherCharacterDisplay(socket, userId, viewerData) {
  if (!io) return;

  for (const [socketId, otherSocket] of io.sockets.sockets) {
    const otherUserId = otherSocket.handshake?.user_id;
    if (otherUserId && otherUserId !== userId) {
      const userData = infos.getData(otherUserId);
      if (userData && viewerData) {
        const halfWidth = (viewerData.max_x - viewerData.min_x - 1) / 2;
        const halfHeight = (viewerData.max_y - viewerData.min_y - 1) / 2;

        if (userData.character.x >= viewerData.min_x - halfWidth &&
            userData.character.x <= viewerData.max_x &&
            userData.character.y >= viewerData.min_y - halfHeight &&
            userData.character.y <= viewerData.max_y) {
          socket.emit('refreshOtherCharactersDisplay', {
            user_id: otherUserId,
            email: userData.email,
            infos: userData.character
          });
        }
      }
    }
  }
}

export default {
  init,
  moveCharacter,
  updateAngle,
  setCharacterPosition,
  determineDirectionAndDistance,
  sendCharacterDisplay,
  getOtherCharacterDisplay
};
