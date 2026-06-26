import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import requestHandler from './requestHandler.js';
import map from './map.js';
import character from './character.js';
import building from './building.js';
import environment from './environment.js';
import infos from './infos.js';
import settings from './settings.js';
import plant from './plant.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// ============ HTTP ROUTES ============

router.get('/', requestHandler.start);
router.post('/start', requestHandler.start);
router.get('/logout', requestHandler.logout);
router.post('/register', requestHandler.register);
router.get('/passwordLost', (req, res) => requestHandler.passwordLost(req, res, {}));
router.post('/passwordLost', requestHandler.passwordLost);
router.get('/resetPassword', requestHandler.resetPassword);
router.post('/resetPassword', requestHandler.resetPassword);
router.get('/play', requestHandler.play);
router.post('/userExists', requestHandler.userExists);
router.post('/userCredentials', requestHandler.userCredentials);

// ============ SOCKET.IO ROUTES ============

function routeSocket(socket, userId) {

  // Map events
  socket.on('getMap', (data) => map.getMap(socket, data));
  socket.on('getMapHandshake', (data) => map.getMap(socket, data, undefined, true));
  socket.on('getPosition', () => map.getPosition(socket));
  socket.on('updateMapPosition', (data) => map.updateMapPosition(socket, data));
  socket.on('getTileInformations', (data) => map.getTileInformations(socket, data));

  // Environment events
  socket.on('getTime', () => environment.getTime(socket));

  // Character events
  socket.on('moveCharacter', (data) => character.moveCharacter(socket, data));
  socket.on('updateAngle', (data) => character.updateAngle(socket, data));

  // Plant events
  socket.on('plantAdd', (data) => plant.plantAdd(socket, data));
  socket.on('plantRemove', (data) => plant.deleteCrop(socket, data));
  socket.on('plantHarvest', (data) => plant.harvest(socket, data));
  socket.on('plantHarvestDistribution', (data) => plant.harvestDistribution(socket, data));
  socket.on('plantFertilize', (data) => plant.fertilize(socket, data));
  socket.on('plantWaterize', (data) => plant.waterize(socket, data));

  // Building events
  socket.on('buildingAdd', (data) => building.buildingAdd(socket, data));
  socket.on('buildingRemove', (data) => building.buildingRemove(socket, data));

  // Information events
  socket.on('getInformations', () => infos.getInformations(socket));
  socket.on('getOwnedWeapon', () => infos.getOwnedWeapon(socket));

  // Settings events
  socket.on('getDisplaySettings', () => settings.getDisplayData(socket));
  socket.on('getBuildingSize', () => settings.getBuildingSizeSocket(socket));
  socket.on('getPrices', () => settings.getPrices(socket));
}

export { routeSocket, router };
export default { routeSocket, router };
