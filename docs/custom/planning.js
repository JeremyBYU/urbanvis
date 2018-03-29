// @ts-check
/// <reference path="./asyncastar.d.ts" />
const AsyncAStar = require("@jeremybyu/asyncastar");

const {addPathsToScene} = require('./util')

const THREE = global.THREE;
const Q3D = global.Q3D;
const proj4 = global.proj4;
const app = Q3D.application;

const OPEN_NODE = new THREE.MeshPhongMaterial({
  color: 0x4169e1,
  opacity: 0.4,
  transparent: true
});
const CLOSED_NODE = new THREE.MeshPhongMaterial({
  color: 0x808080,
  opacity: 0.7,
  transparent: true
});
const PATH_NODE = new THREE.MeshPhongMaterial({ color: 0xff0000 });
const GOAL_NODE = new THREE.MeshPhongMaterial({ color: 0x008000 });

const SPHERE_GEOMETRY = new THREE.SphereGeometry(1 * app.project.scale, 32, 32);


// 51.4363, 7.3345, Elev. 101.57
const GOAL_SPHERICAL = [7.3345, 51.4363, 115];
const GOAL_PROJECTED = proj4(app.project.proj).forward(GOAL_SPHERICAL);
let pos = app.project.toThreeJSCoordinates.apply(
  app.project,
  proj4(app.project.proj).forward(GOAL_SPHERICAL)
);
const GOAL_THREEJS = app.project.toThreeJSCoordinates.apply(
  app.project,
  GOAL_PROJECTED
);

/** @type {AsyncAstar<T>} */
let AsyncPlanner;
const NODES = new Map();

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
    return lo;
  } else if (a > hi) {
    return hi;
  }
  return a;
}

function convertCell(coord, toCell = true, meta = MAZE_META) {
  if (toCell) {
    let xMeters = coord[0] - meta.xmin;
    let yMeters = coord[1] - meta.ymin;
    let zMeters = coord[2] - meta.zmin;

    let j = bound(
      Math.floor((xMeters - meta.xres / 2000) / meta.xres),
      0,
      meta.ncols - 1
    );
    let i = bound(
      Math.floor((yMeters - meta.yres / 2000) / meta.yres),
      0,
      meta.rows - 1
    );
    let k = bound(
      Math.floor((zMeters - meta.zres / 2000) / meta.zres),
      0,
      meta.nslices - 1
    );

    return [i, j, k];
  } else {
    let xMeters = coord[1] * meta.xres + meta.xmin;
    let yMeters = coord[0] * meta.yres + meta.ymin;
    let zMeters = coord[2] * meta.zres + meta.zmin;

    return [xMeters, yMeters, zMeters];
  }
}

global.convertCell = convertCell;

function createCircle(node, material = OPEN_NODE) {
  let data = node.data ? node.data: node
  // console.log('create circle')
  // return
  let pos_projected = convertCell([data.x, data.y, data.z], false);
  let pos_3js = app.project.toThreeJSCoordinates.apply(
    app.project,
    pos_projected
  );
  let geometry = SPHERE_GEOMETRY
  let sphere = new THREE.Mesh(geometry, material);
  sphere.position.set(pos_3js.x, pos_3js.y, pos_3js.z);
  app.scene.add(sphere);
  NODES.set(data.toString(), sphere);
}

function updateCircle(node, color = 0x808080) {
  const data = node.data
  // console.log('update circle')
  // return
  const sphere = NODES.get(data.toString());
  if (sphere) {
    sphere.material = CLOSED_NODE;
  }
}

/**
 *
 *
 * @param {Array} path
 */
function createPath(path) {
  path.forEach(node => {
    const sphere = NODES.get(node.data.toString());
    if (sphere) {
      sphere.material = PATH_NODE;
    }
  });
}

/**
 *
 *
 * @param {Array} path
 */
function createLinePath(path) {
  let vec_array = [];
  let path_vectors = path.map(node => {
    let pos_projected = convertCell([node.data.x, node.data.y, node.data.z], false);
    let three_c = app.project.toThreeJSCoordinates.apply(
      app.project,
      pos_projected
    );
    return new THREE.Vector3(three_c.x, three_c.y, three_c.z)
  });
  vec_array.push(path_vectors)
  global.path_geometries = addPathsToScene(vec_array, .99, 0xff0000)
}

// app.project.toMapCoordinates(point.x, point.y, point.z);
// var lonLat = proj4(app.project.proj).inverse([pt.x, pt.y]);

function threeJStoGPS(point) {
  let pt = app.project.toMapCoordinates(point.x, point.y, point.z);
  let lonLat = proj4(app.project.proj).inverse([pt.x, pt.y]);
  lonLat.push(pt.z);
  return lonLat;
}

function gpsToCell(gps) {
  const projected = proj4(app.project.proj).forward(gps);
  console.log(gps, projected);
  const cell = convertCell(projected, true, MAZE_META);
  return cell;
}

function startHandler() {
  const scope = Q3D.gui;
  const weight = scope.parameters.planner.weight;
  const zDist = Math.floor(15 / 2);
  const startCell = gpsToCell(threeJStoGPS(global.quad_group.position));
  let goalCell = gpsToCell(threeJStoGPS(app.queryMarker.position));
  goalCell[2] = goalCell[2] + zDist;
  // remove all previous nodes! Also the line path IF it was created
  NODES.forEach(node => {
    app.scene.remove(node);
    node.geometry.dispose();
  });
  if (global.path_geometries) {
    global.path_geometries.forEach(line => {
      app.scene.remove(line)
      line.geometry.dispose()
    })
  }
  NODES.clear()

  createPlanner(global.maze, startCell, goalCell, weight);
}
function createPlanner(map, startCell, goalCell, weight = 1) {
  const scope = Q3D.gui;
  let heuristic = scope.parameters.planner.heuristic
  createCircle({ x: goalCell[0], y: goalCell[1], z: goalCell[2] }, GOAL_NODE);
  // createCircle({x: startCell[0], y: startCell[1], z: startCell[2]}, GOAL_NODE)
  AsyncPlanner = AsyncAStar.util.createPlanner(
    map,
    startCell,
    goalCell,
    true,
    heuristic,
    weight
  );
}

function plan() {
  let scope = Q3D.gui;
  if (
    scope.parameters.planner &&
    scope.parameters.planner.active &&
    AsyncPlanner
  ) {
    if (!AsyncPlanner.finished) {
      const scope = Q3D.gui;
      const speed = Math.floor(scope.parameters.planner.speed);
      const showNodes = scope.parameters.planner.showNodes
      // let result = AsyncPlanner.searchAsync(speed);
      
      let result = AsyncPlanner.searchAsync(speed, showNodes ? updateCircle : undefined, showNodes ? createCircle : undefined )
      if (result.status === 2) {
        console.log(result)
        if (showNodes) {
          createPath(result.path);
        } else {
          createLinePath(result.path)
        }
      }
    }
  }
}

module.exports = {
  plan: plan,
  startHandler: startHandler,
  createPlanner: createPlanner
};
