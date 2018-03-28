// @ts-check
/// <reference path="./asyncastar.d.ts" />
const AsyncAStar = require("@jeremybyu/asyncastar");

const THREE = global.THREE
const Q3D = global.Q3D
const proj4 = global.proj4


const OPEN_NODE = new THREE.MeshPhongMaterial( {color: 0x4169E1, opacity: .4, transparent: true} );
const CLOSED_NODE = new THREE.MeshPhongMaterial( {color: 0x808080, opacity: .7, transparent: true} );
const GOAL_NODE = new THREE.MeshPhongMaterial( {color: 0x008000} );


const app = Q3D.application;

const GOAL_SPHERICAL = [7.3338, 51.4365, 135]
const GOAL_PROJECTED = proj4(app.project.proj).forward(GOAL_SPHERICAL)
  let pos = app.project.toThreeJSCoordinates.apply(
    app.project,
    proj4(app.project.proj).forward(GOAL_SPHERICAL)
  );
const GOAL_THREEJS = app.project.toThreeJSCoordinates.apply(app.project, GOAL_PROJECTED);

/** @type {AsyncAstar<T>} */
let AsyncPlanner 
const NODES = new Map()

const MAZE_META = {
  nrows: 644,
  yres: 2,
  xmin: 384076.62662447337,
  ymin: 5699397.285916773,
  zres: 2,
  xres: 2,
  zmin: 90,
  nslices: 45,
  ncols: 797
};

function bound(a, lo, hi) {
  if (a < lo) {
    return lo
  } else if(a > hi) {
    return hi
  }
  return a
}

function convertCell(coord, toCell = true, meta=MAZE_META) {
  if (toCell) {
    let xMeters = coord[0] - meta.xmin
    let yMeters = coord[1] - meta.ymin
    let zMeters = coord[2] - meta.zmin

    let j = bound(Math.floor((xMeters - meta.xres / 2000) / meta.xres), 0, meta.ncols - 1)
    let i = bound(Math.floor((yMeters - meta.yres / 2000) / meta.yres), 0, meta.rows - 1)
    let k = bound(Math.floor((zMeters - meta.zres / 2000) / meta.zres), 0, meta.nslices - 1)

    return [i, j, k]
  } else {
    let xMeters = coord[1] * meta.xres + meta.xmin
    let yMeters = coord[0] * meta.yres + meta.ymin
    let zMeters = coord[2] * meta.zres + meta.zmin

    return [xMeters, yMeters, zMeters]
  }
}

function createCircle(data, material=OPEN_NODE) {
  let pos_projected = convertCell([data.x, data.y, data.z], false)
  let pos_3js = app.project.toThreeJSCoordinates.apply(app.project, pos_projected);
  let geometry = new THREE.SphereGeometry( 1 * app.project.scale, 32, 32 );
  let sphere = new THREE.Mesh( geometry, material );
  sphere.position.set(pos_3js.x, pos_3js.y, pos_3js.z);
  app.scene.add(sphere)
  NODES.set(data.toString(), sphere)
}

function updateCircle(data, color=0x808080) {
  const sphere = NODES.get(data.toString())
  if (sphere) {
    sphere.material = CLOSED_NODE
  }
}


function gpsToCell(gps) {
  const projected = proj4(app.project.proj).forward(gps)
  console.log(gps, projected)
  const cell = convertCell(projected, true, MAZE_META)
  return cell
}

function createPlanner(map, start, goal=GOAL_SPHERICAL) {
  // get quad position and map to projecte coordinates, then to cell
  // goal is always in gps, convert to cell
  global.map = map
  let startCell = gpsToCell(start)
  let goalCell = gpsToCell(goal)
  console.log(startCell, goalCell)
  createCircle({x: goalCell[0], y: goalCell[1], z: goalCell[2]}, GOAL_NODE)
  createCircle({x: startCell[0], y: startCell[1], z: startCell[2]}, GOAL_NODE)
  AsyncPlanner = AsyncAStar.util.createPlanner(map, startCell, goalCell, true, 'manhattan')
}

function plan() {
  let scope = Q3D.gui;
  if (scope.parameters.planner && scope.parameters.planner.active && AsyncPlanner) {
    if (!AsyncPlanner.finished) {
      let result = AsyncPlanner.searchAsync(1, (node) => updateCircle(node.data), (node) => createCircle(node.data))
      console.log(result)
    }

  }

}

module.exports = {
  plan: plan,
  createPlanner: createPlanner
}

