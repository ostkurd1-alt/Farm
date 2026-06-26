import infos from './infos.js';
import map from './map.js';
import globalSettings from './settings.js';

let io = null;

function init(socketIo) {
  io = socketIo;
}

function refreshViewerMap(x, y, exception) {
  if (!io) return;

  for (const [socketId, socket] of io.sockets.sockets) {
    const userId = socket.handshake?.user_id;

    if (userId && userId !== exception) {
      const viewerData = infos.getMapData(userId);

      if (viewerData) {
        const halfWidth = (viewerData.max_x - viewerData.min_x - 1) / 2;
        const halfHeight = (viewerData.max_y - viewerData.min_y - 1) / 2;

        if (x >= viewerData.min_x - halfWidth && x <= viewerData.max_x &&
            y >= viewerData.min_y - halfHeight && y <= viewerData.max_y) {
          map.refreshMap(socket);
        }
      }
    }
  }
}

function showTornado(x, y, data) {
  if (!io) return;

  for (const [socketId, socket] of io.sockets.sockets) {
    const userId = socket.handshake?.user_id;

    if (userId) {
      const viewerData = infos.getMapData(userId);

      if (viewerData && x >= viewerData.min_x && x <= viewerData.max_x &&
          y >= viewerData.min_y && y <= viewerData.max_y) {
        socket.emit('tornado', data);
      }
    }
  }
}

function updateTime(data) {
  if (!io) return;
  io.emit('updateTime', data);
}

function getSocketByUserId(userId) {
  if (!io) return null;

  for (const [socketId, socket] of io.sockets.sockets) {
    if (socket.handshake?.user_id === userId) {
      return socket;
    }
  }
  return null;
}

function refreshMarketPrices() {
  if (!io) return;

  for (const [socketId, socket] of io.sockets.sockets) {
    if (socket.handshake?.user_id) {
      globalSettings.refreshMarketPrices(socket);
    }
  }
}

export default {
  init,
  refreshViewerMap,
  showTornado,
  updateTime,
  getSocketByUserId,
  refreshMarketPrices
};
