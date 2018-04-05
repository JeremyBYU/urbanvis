(function(){function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s}return e})()({1:[function(require,module,exports){
(function (global){
"use strict";
// @ts-check
// Make this global
/**
 *  @type {object}
 */
var app, THREE, quad_group, Q3D;

var THREE = global.THREE
var Q3D = global.Q3D

var proj4 = global.proj4

var app = Q3D.application;
app.scene.autoUpdate = true;

const {
  CinemaEvents,
  scheduleEvents,
  promise_object_loader,
  addPathsToScene,
  setObjectRotation,
  createLine,
  loadNumpy,
} = require("./util");

const {plan, createPlanner, startHandler} = require('./planning')

// These are loaders from THREEJS to load objects, textures, or general files
const OBJ_LOADER = new THREE.ObjectLoader();
const TEXTURE_LOADER = new THREE.TextureLoader();
const FILE_LOADER = new THREE.FileLoader();

// These are the starting coordinates of the UAS in spherical and THREEJS coordinate sytems
// const STARTING_POSITION_SPHERICAL = [7.33364, 51.436723, 133.67];
const STARTING_POSITION_SPHERICAL = [7.33364, 51.436723, 108];
let pos = app.project.toThreeJSCoordinates.apply(
  app.project,
  proj4(app.project.proj).forward(STARTING_POSITION_SPHERICAL)
);
const STARTING_POSITION = [pos.x, pos.y, pos.z];
// These are general constants
const RED_BUILDINGS_LAYER = 1; // Index of red buildings layer
const BUILDING_COST_LAYER = 2; // Index of gradient blue buildings layer
const ALL_BUILDINGS_LAYER = 3; // Index of all buildings layer
const DEFAULT_DELAY = 200; // A default delay (in ms) used in Cinematic Events
const STAR_HEIGHT = 2; // Height in Meters of the "star" above a goal

const SPEED = 0.01;
const MAX_POINTS = 1000;

// Just some globals used when creating paths, starts, and spheres
var path_vectors = [];
var path_geometries = [];
var star_group = new THREE.Group();
var sphere_group = new THREE.Group();

global.star_group = star_group



// These are all the 'cinema' events
// They start/finish by either by timers, sequences, or variables reaching some value
// Read the README.md to understand more
let cinema_timings = {
  start: {
    start_offset: 0,
    finished: false,
    active: false
  },
  events: [
    new CinemaEvents({
      name: "initial_zoom",
      variable: "offset",
      amt: 1.02,
      until: 20,
      eps: 1
    }),
    new CinemaEvents({
      name: "initial_tilt",
      variable: "phi",
      amt: 0.01,
      until: 0.94
    }),
    new CinemaEvents({
      name: "activate_danger",
      pre_event: "initial_zoom",
      customExec: () => {
        quad_group.children[4].visible = true;
      },
      customCheck: () => true,
      start_offset: DEFAULT_DELAY
    }),
    new CinemaEvents({
      name: "first_rotate",
      variable: "theta",
      amt: 0.01,
      until: 3.1,
      pre_event: "activate_danger",
      start_offset: DEFAULT_DELAY
    }),
    new CinemaEvents({
      name: "activate_db",
      pre_event: "first_rotate",
      customExec: () => {
        quad_group.children[4].visible = false;
        quad_group.children[3].visible = true;
      },
      customCheck: () => true,
      start_offset: DEFAULT_DELAY
    }),
    new CinemaEvents({
      name: "zoom_out_2",
      variable: "offset",
      amt: 0.98,
      until: 400 * app.project.zScale,
      pre_event: "activate_db",
      start_offset: DEFAULT_DELAY,
      eps: 20
    }),
    new CinemaEvents({
      name: "second_rotate",
      variable: "theta",
      amt: 0.01,
      until: -2.6,
      pre_event: "activate_db",
      start_offset: DEFAULT_DELAY
    }),
    new CinemaEvents({
      name: "second_tilt",
      variable: "phi",
      amt: 0.01,
      until: 0.55,
      pre_event: "activate_db",
      start_offset: DEFAULT_DELAY
    }),
    new CinemaEvents({
      name: "show_red_buidlings",
      pre_event: "zoom_out_2",
      customExec: function() {
        this.counter += 1;
        app.project.layers[RED_BUILDINGS_LAYER].setOpacity(this.counter / 100);
        app.project.layers[ALL_BUILDINGS_LAYER].setOpacity(
          1 - this.counter / 100
        );
      },
      customCheck: function() {
        return this.counter > 100;
      },
      start_offset: DEFAULT_DELAY
    }),
    new CinemaEvents({
      name: "show_building_cost",
      pre_event: "show_red_buidlings",
      customExec: function() {
        this.counter += 1;
        app.project.layers[BUILDING_COST_LAYER].setOpacity(this.counter / 100);
      },
      customCheck: function() {
        return this.counter > 100;
      },
      start_offset: DEFAULT_DELAY
    }),
    new CinemaEvents({
      name: "show_goals",
      pre_event: "show_building_cost",
      customExec: () => {
        star_group.visible = true;
      },
      customCheck: () => true,
      start_offset: DEFAULT_DELAY
    }),
    new CinemaEvents({
      name: "draw_paths",
      pre_event: "show_goals",
      customExec: function() {
        if (this.counter === 0) {
          sphere_group.visible = true;
        }
        this.counter = this.counter + 2;
        path_geometries.forEach((line, index) => {
          // Set line color
          const positions = line.geometry.attributes.position.array;
          const end_line_pos = [
            positions[this.counter * 3],
            positions[this.counter * 3 + 1],
            positions[this.counter * 3 + 2]
          ];
          sphere_group.children[index].position.set(
            end_line_pos[0],
            end_line_pos[1],
            end_line_pos[2]
          );
          line.geometry.setDrawRange(0, this.counter);
        });
      },
      customCheck: function() {
        return this.counter > MAX_POINTS - 5;
      },
      start_offset: 1000
    })
  ]
};

// Modify DAT GUI to allow scripting the camera control
addCinemaGUI();
// Load all the custom models into the ThreeJS environment
load_models();

async function load_models() {
  // Here we are asynchronously loading all the models, textures, and files that we will need
  let loaded_quad = promise_object_loader("models/uas.json", OBJ_LOADER);
  let loaded_box = promise_object_loader("models/box.json", OBJ_LOADER);
  let loaded_texture = promise_object_loader(
    "models/amazon_box.jpg",
    TEXTURE_LOADER
  );
  let loaded_db = promise_object_loader("models/db.json", OBJ_LOADER);
  let loaded_danger = promise_object_loader("models/danger.json", OBJ_LOADER);
  let promise_star = promise_object_loader("models/star.json", OBJ_LOADER);
  let promise_paths = promise_object_loader("models/paths.json", FILE_LOADER);
  let promise_sphere = promise_object_loader("models/sphere.json", OBJ_LOADER);
  Promise.all([
    loaded_quad,
    loaded_box,
    loaded_texture,
    loaded_db,
    loaded_danger,
    promise_star,
    promise_paths,
    promise_sphere
  ]).then(([quad, box, box_texture, db, danger, star, path_resp, sphere]) => {
    // update box material to amazon prime picture
    box.material = new THREE.MeshPhongMaterial({
      map: box_texture,
      side: THREE.DoubleSide
    });
    box.position.set(0, 0, -0.4);

    // create connecting line between box and drone
    let line = createLine([box.position, quad.position]);

    // Create the DB Mesh, set invisible initially
    db.position.set(0, 0, 0.2);
    db.visible = false;

    // Create the danger sign mesh, set invisible
    danger.position.set(0, 0, 0.5);
    danger.visible = false;

    // Create the Quadrotor Group: quad, box, db, and line
    quad_group = new THREE.Group();
    quad_group.position.set.apply(quad_group.position, STARTING_POSITION);
    quad_group.add(quad, box, line, db, danger);
    quad_group.scale.set(app.project.scale, app.project.scale, app.project.scale)
    global.quad_group = quad_group // Set a global variable, ugly but helps out quite a bit
    // add to scene
    app.scene.add(quad_group);
    // make the controls focus on the quad group
    app.camera.position.set(-2000, -2000, 800);
    app.controls.target = quad_group.position;

    // Get the paths to display
    let path_details = JSON.parse(path_resp).features;
    path_vectors = path_details.map(feature => {
      let vec_array = [];
      feature.geometry.coordinates.forEach(coord => {
        let map_coord = proj4(app.project.proj).forward(coord);
        let three_c = app.project.toThreeJSCoordinates.apply(
          app.project,
          map_coord
        );
        vec_array.push(new THREE.Vector3(three_c.x, three_c.y, three_c.z));
      });
      return vec_array;
      // proj4(app.project.proj)
    });
    path_geometries = addPathsToScene(path_vectors, 0);
    addStars(path_vectors, star);
    addSpheres(path_vectors, sphere);
    // Dirty the controller so that theta, phi, and offset states are updated and set.
    app.controls.rotateLeft(0.001);
    app.controls.offset
      .copy(app.controls.target)
      .sub(app.controls.object.position);

    // Set the initial Layers opacity
    app.project.layers[RED_BUILDINGS_LAYER].setOpacity(0);
    app.project.layers[BUILDING_COST_LAYER].setOpacity(0);

    // Everything is now setup to run our animate function.
    window.userAnimateFunction = animateFunction;

    loadNumpy('./custom/data/total_bin_mesh_res002.npy').then((data) => {
      global.maze =data // set global variable
    })
  });
}

function addStars(path_vectors, star_template) {
  // Need to add a dummy group around the star so that it can be displaced instead of the mesh
  let star_group_template = new THREE.Group();
  star_group_template.add(star_template);
  path_vectors.forEach(path => {
    let end_vec = path[path.length - 1];
    let clone_star = star_group_template.clone();
    clone_star.position.set(end_vec.x, end_vec.y, end_vec.z + STAR_HEIGHT);
    star_group.add(clone_star);
  });
  app.scene.add(star_group);
  star_group.visible = false;
}

function addSpheres(path_vectors, sphere_template) {
  path_vectors.forEach(path => {
    let start_vec = path[0];
    let clone_sphere = sphere_template.clone();
    clone_sphere.position.set(start_vec.x, start_vec.y, start_vec.z);
    sphere_group.add(clone_sphere);
  });
  app.scene.add(sphere_group);
  sphere_group.visible = false;
}

// Add command to DAT GUI for scripting the control of the camera
function addCinemaGUI() {
  let scope = Q3D.gui;
  var folder = scope.gui.addFolder("Cinema");
  scope.parameters.cinema = {};
  scope.parameters.active_cinema = false;
  scope.parameters.cinema.cinema_timings = cinema_timings;

  folder.add(scope.parameters, "active_cinema").name("Active");


  var folder = scope.gui.addFolder("Path Planner");
  scope.parameters.planner = { speed: 1, active: true, start: startHandler, weight:1, heuristic: "manhattan", showNodes:true, goal_height: 15 };
  
  folder.add(scope.parameters.planner, "speed", 0, 100, 1).name("Speed");
  folder.add(scope.parameters.planner, "weight", 0, 10, 1).name("Avoid Obstacles");
  folder.add(scope.parameters.planner, "heuristic", ["manhattan", "octile", "euclidean"]).name("Heuristic");
  folder.add(scope.parameters.planner, "showNodes").name("Show Nodes");
  folder.add(scope.parameters.planner, "start").name("(Re)Start");
  folder.add(scope.parameters.planner, "active").name("Active");
  
  var folder_misc = scope.gui.addFolder("Misc Parameters");
  folder_misc.add(scope.parameters.planner, "goal_height", 8, 20, 1).name("Goal height");
  // folder.add(scope.parameters.cmd, 'wf').name('Wireframe Mode').onChange(Q3D.application.setWireframeMode);
}

function animateFunction() {
  plan()
  if (!Q3D.gui.parameters.active_cinema) return;

  // animate danger triangle and goal positions
  quad_group.children[4].rotation.y += SPEED * 2;
  setObjectRotation(star_group);

  scheduleEvents(cinema_timings);
  // app.controls.dollyIn(1.1);

}

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./planning":2,"./util":3}],2:[function(require,module,exports){
(function (global){
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
  opacity: 0.1,
  transparent: true
});
const CLOSED_NODE = new THREE.MeshPhongMaterial({
  color: 0x808080,
  opacity: 0.3,
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
  const height = scope.parameters.planner.goal_height
  const zDist = Math.floor(height / 2);
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
      let speed = Math.floor(scope.parameters.planner.speed);
      if (speed > 10) {
        speed = speed * 10;
      }
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

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./util":3,"@jeremybyu/asyncastar":4}],3:[function(require,module,exports){
"use strict";
// @ts-check
const SPEED = 0.01;
const MAX_POINTS = 1000;

/**
 * Returns a promise for THREE.js model and texture loaders
 *
 * @param {string} filename
 * @param {object} [loader] The loader to use
 * @returns
 */
function promise_object_loader(filename, loader) {
  return new Promise((res, rej) => {
    loader.load(
      filename,
      obj => {
        res(obj);
      },
      progress => {},
      err => {
        console.log(err);
      }
    );
  });
}

function around(val1, val2, eps = 0.05) {
  val1 = typeof val1 === "number" ? val1 : val1.length();
  return Math.abs(val1 - val2) < eps;
}

function addPathsToScene(path_vectors, percent = 1, color = 0xFFD700) {
  let path_geometries = path_vectors.map(vectors =>
    createBufferLineGeometry(vectors, color)
  );
  path_geometries.forEach(line => {
    line.geometry.setDrawRange(
      0,
      Math.min(MAX_POINTS - 1, percent * MAX_POINTS)
    );
    line.geometry.attributes.position.needsUpdate = true;
    app.scene.add(line);
  });
  return path_geometries;
}

function scheduleEvents(timings) {
  if (!timings.start.finished) {
    if (!timings.start.active) {
      timings.start.active = true;
      setTimeout(
        () => (timings.start.finished = true),
        timings.start.start_offset
      );
    }
  } else {
    // execute active events
    let active_events = timings.events.filter(event => event.active);
    active_events.forEach(event => event.execute());
    // Filter out finished and active events
    let possible_new_events = timings.events.filter(
      event => !event.finished && !event.active
    );
    possible_new_events.forEach(event => {
      if (typeof event.pre_event === "string") {
        let event_ = timings.events.find(
          event_ => event.pre_event === event_.name
        );
        // If the pre event has finished than make it active
        if (event_.finished) {
          event.start_event();
        }
      } else {
        event.start_event();
      }
    });
    // start new events
  }
}

/**
 * This class created Cinema Events. Events that modify the camera or the environments
 *
 * @class CinemaEvents
 */
class CinemaEvents {
  constructor({
    name = "UK",
    variable = "phi",
    until = 1,
    amt = 0.01,
    pre_event = null,
    start_offset = 0,
    end_timer = null,
    eps = 0.05,
    customExec = null,
    customCheck = null
  } = {}) {
    this.finished = false;
    this.active = false;

    this.name = name;
    this.variable = variable;
    this.until = until;
    this.amt = amt;
    this.pre_event = pre_event;
    this.start_offset = start_offset;
    this.end_timer = end_timer;
    this.eps = eps;
    this.customExec = customExec ? customExec.bind(this) : null;
    this.customCheck = customCheck ? customCheck.bind(this) : null;

    this.cameraVars = ["offset", "theta", "phi"];
    this.counter = 0;
    // This is a global variable provided by QGIS2THREEJS
    this.app = Q3D.application;
  }
  moveCamera() {
    // Only check a value if there is not end timer configured
    let value =
      this.variable == "offset"
        ? this.app.controls.offset.length()
        : this.app.controls[this.variable];
    if (this.end_timer === null && around(value, this.until, this.eps)) {
      this.finished_callback();
      return;
    }
    switch (this.variable) {
      case "offset":
        this.app.controls.dollyIn(this.amt);
        break;
      case "theta":
        this.app.controls.rotateLeft(this.amt);
        break;
      case "phi":
        this.app.controls.rotateUp(this.amt);
        break;
      default:
        console.error("Unknown Variable!");
    }
  }
  execute() {
    if (this.customExec) {
      this.customExec();
      if (this.customCheck()) {
        this.finished_callback();
      }
    } else {
      if (this.cameraVars.includes(this.variable)) {
        this.moveCamera();
      }
    }
  }
  finished_callback() {
    this.finished = true;
    this.active = false;
  }
  start_event() {
    // Wait some time before starting the event
    if (!this.pre_timer) {
      this.pre_timer = setTimeout(
        () => (this.active = true),
        this.start_offset
      );
    }
    // The event is configured to end by a timer. Set the close it off in the future
    if (this.end_timer) {
      if (!this.post_timer) {
        this.post_timer = setTimeout(
          () => this.finished_callback(),
          this.end_timer + this.start_offset
        );
      }
    }
  }
}

function setObjectVisibility(item, visible = true) {
  item.traverse(node => {
    node.visible = visible;
  });
}

function setObjectRotation(item) {
  var axis = new THREE.Vector3(0, 1, 0).normalize();
  item.traverse(node => {
    if (node.type === "Mesh") {
      node.rotateOnAxis(axis, SPEED * 2);
    }
  });
}

function createLine(vertices, lineWidth = 0.02, color = 0x000000) {
  let lineGeom = new THREE.Geometry();
  vertices.forEach(vertex => lineGeom.vertices.push(vertex));

  let line = new MeshLine();
  line.setGeometry(lineGeom);
  let color_ = new THREE.Color(color);
  let material = new MeshLineMaterial({ color: color_, lineWidth });
  let mesh = new THREE.Mesh(line.geometry, material); // this syntax could definitely be improved!
  return mesh;
}

function interpolateLine(line_geom, vectors, total_size = 1000) {
  // This contains the actual geometry array buffer!
  const positions = line_geom.geometry.attributes.position.array;
  // How many points pairs of vectors
  let interp_calls = vectors.length - 1;
  let points_per_interp_call = Math.floor(total_size / interp_calls);
  let leftover = (total_size - points_per_interp_call * interp_calls)
  let n = 0;
  for (let index = 0; index < vectors.length - 1; index++) {
    const vectorFrom = vectors[index];
    const vectorTo = vectors[index + 1];
    for (let index = 0; index < points_per_interp_call; index++) {
      let newVec = new THREE.Vector3();
      newVec = newVec.lerpVectors(
        vectorFrom,
        vectorTo,
        index / points_per_interp_call
      );
      positions[n++] = newVec.x;
      positions[n++] = newVec.y;
      positions[n++] = newVec.z;
    }
  }
  const lastVec  = vectors[vectors.length -1]
  for (let i = 0; i < leftover; i++) {
    positions[n++] = lastVec.x
    positions[n++] = lastVec.y
    positions[n++] = lastVec.z
  }
}

function createBufferLineGeometry(vectors, color = 0x0000ff, linewidth = 2) {
  const init_draw_count = 2;
  // geometry
  var geometry = new THREE.BufferGeometry();

  // const numPoints = vectors.length * 3
  // attributes
  var positions = new Float32Array(MAX_POINTS * 3); // 3 vertices per point
  geometry.addAttribute("position", new THREE.BufferAttribute(positions, 3));

  geometry.setDrawRange(0, init_draw_count);
  // material
  var material = new THREE.LineBasicMaterial({ color, linewidth });

  // Create the actual mesh
  const line = new THREE.Line(geometry, material);
  // Fill in the actual points for the line
  interpolateLine(line, vectors, MAX_POINTS);

  line.geometry.attributes.position.needsUpdate = true; // required after the first render
  return line;
}

/// Extra stuff

const NumpyParser = require("numpy-parser");
const NDArray = require("ndarray");

function ajax(url, callback) {
  var xhr = new XMLHttpRequest();
  xhr.onload = function(e) {
    var buffer = xhr.response; // not responseText
    var result = NumpyParser.fromArrayBuffer(buffer);
    callback(result);
  };
  xhr.open("GET", url, true);
  xhr.responseType = "arraybuffer";
  xhr.send(null);
}

function loadNumpy(npFile) {
  return new Promise((res, rej) => {
    ajax(npFile, function(data) {
      const result = NDArray(data.data, data.shape);
      res(result);
    });
  });
}




// let pos = app.project.toThreeJSCoordinates.apply(
//   app.project,
//   proj4(app.project.proj).forward(STARTING_POSITION_SPHERICAL)
// );

module.exports = {
  CinemaEvents: CinemaEvents,
  scheduleEvents: scheduleEvents,
  promise_object_loader: promise_object_loader,
  addPathsToScene: addPathsToScene,
  setObjectRotation: setObjectRotation,
  loadNumpy: loadNumpy,
  createLine: createLine
};

},{"ndarray":12,"numpy-parser":13}],4:[function(require,module,exports){
"use strict";
function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
}
Object.defineProperty(exports, "__esModule", { value: true });
__export(require("./lib/asyncastar"));
const util1 = __importStar(require("./lib/util"));
exports.util = util1;
},{"./lib/asyncastar":5,"./lib/util":6}],5:[function(require,module,exports){
"use strict";
/**
 *   AsyncAstar.ts
 *   github.com/jeremybyu/AsyncAstar
 *   Licensed under the MIT license.
 *
 *   Implementation By Jeremy Castagno (@jeremybyu)
 */
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
}
Object.defineProperty(exports, "__esModule", { value: true });
const Heap = __importStar(require("heap"));
var AsyncAstarStatus;
(function (AsyncAstarStatus) {
    AsyncAstarStatus[AsyncAstarStatus["NORM"] = 1] = "NORM";
    AsyncAstarStatus[AsyncAstarStatus["SUCCESS"] = 2] = "SUCCESS";
    AsyncAstarStatus[AsyncAstarStatus["FAIL"] = 3] = "FAIL";
    AsyncAstarStatus[AsyncAstarStatus["ERROR"] = 4] = "ERROR";
})(AsyncAstarStatus = exports.AsyncAstarStatus || (exports.AsyncAstarStatus = {}));
class NodeCost {
    constructor(data, open = true, g = 0) {
        this.data = data;
        this.g = g;
        this.f = 0;
        this.closed = false;
        this.open = open;
        this.parent = null;
    }
}
exports.NodeCost = NodeCost;
class AsyncAstar {
    constructor(start, goal, hashFn, genSuccessorsFn, heuristicFn, stopFn) {
        this.startNode = new NodeCost(start);
        // this.goalNode = new NodeCost(goalNode, false, Number.POSITIVE_INFINITY);
        this.goal = goal;
        this.hashFn = hashFn;
        this.genSuccessorsFn = genSuccessorsFn;
        this.heuristicFn = heuristicFn;
        this.stopFn = stopFn ? stopFn : (a, b) => this.hashFn(a) === this.hashFn(b);
        this.nodeSet = new Map();
        this.nodeSet.set(this.hashFn(this.startNode.data), this.startNode);
        // this.nodeSet.set(this.hashFn(this.goalNode.data), this.goalNode);
        this.openList = new Heap.default((a, b) => a.f - b.f);
        this.openList.push(this.startNode);
        this.finished = false;
    }
    searchAsync(iterations = Number.POSITIVE_INFINITY, closedNodeCb, openNodeCb) {
        if (this.finished) {
            return { status: AsyncAstarStatus.ERROR };
        }
        // Instead of a While loop, we use the iterations requested (node expansions)
        for (let i = 0; i < iterations; i++) {
            const curNode = this.openList.pop();
            // Check if the open list is empty
            if (curNode === undefined) {
                this.finished = true;
                return { status: AsyncAstarStatus.FAIL };
            }
            // Check if we have found the goal
            if (this.stopFn(curNode.data, this.goal)) {
                this.finished = true;
                // TODO get path
                return { status: AsyncAstarStatus.SUCCESS, path: this.getPath(curNode) };
            }
            // Put this node on the closed 'list', simply set a bit flag
            curNode.closed = true;
            curNode.open = false;
            const [neighbors, transition] = this.genSuccessorsFn(curNode.data);
            if (closedNodeCb) {
                closedNodeCb(curNode);
            }
            // Iterate through neighbors. Remember the neighbors are Nodes (T) not NodeCost<T>
            // Hence we look it up in the node set using the hash function, which return NodeCost<T>
            for (let j = 0; j < neighbors.length; j++) {
                let possibleNode = this.nodeSet.get(this.hashFn(neighbors[j]));
                // Skip any nodes in the closed set
                if (possibleNode && possibleNode.closed) {
                    continue;
                }
                if (!possibleNode) {
                    // New Node
                    possibleNode = new NodeCost(neighbors[j]);
                    possibleNode.g = curNode.g + transition[j];
                    possibleNode.f = possibleNode.g + this.heuristicFn(possibleNode.data, this.goal);
                    possibleNode.parent = curNode;
                    // Push onto the open list
                    this.openList.push(possibleNode);
                    this.nodeSet.set(this.hashFn(neighbors[j]), possibleNode);
                    if (openNodeCb) {
                        openNodeCb(possibleNode);
                    }
                }
                else {
                    // Must already be in the open list/frontier
                    const newG = curNode.g + transition[j];
                    if (newG < possibleNode.g) {
                        // This path is better!
                        possibleNode.g = newG;
                        possibleNode.f = newG + this.heuristicFn(possibleNode.data, this.goal);
                        possibleNode.parent = curNode;
                        this.openList.updateItem(possibleNode);
                    }
                }
            }
        }
        // We looped thorough all iterations, but did not find the goal
        return { status: AsyncAstarStatus.NORM };
    }
    getPath(goal) {
        const path = [];
        path.push(goal);
        // Iterate through the path
        let node = goal;
        while (node.parent !== null) {
            const parent = node.parent;
            path.push(parent);
            node = parent;
        }
        path.reverse();
        return path;
    }
    updateHeuristic(newHeuristicFn) {
        this.heuristicFn = newHeuristicFn;
    }
    updateGenSuccesors(newGenSuccessors) {
        this.genSuccessorsFn = newGenSuccessors;
    }
    getAllNodes() {
        return this.nodeSet;
    }
    reset(start, goal) {
        this.startNode = new NodeCost(start);
        this.goal = goal;
        this.nodeSet = new Map();
        this.nodeSet.set(this.hashFn(this.startNode.data), this.startNode);
        // this.nodeSet.set(this.hashFn(this.goalNode.data), this.goalNode);
        this.openList = new Heap.default((a, b) => a.f - b.f);
        this.openList.push(this.startNode);
        this.finished = false;
    }
}
exports.AsyncAstar = AsyncAstar;
},{"heap":7}],6:[function(require,module,exports){
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
}
Object.defineProperty(exports, "__esModule", { value: true });
const lodash_partial_1 = __importDefault(require("lodash.partial"));
const ndarray_1 = __importDefault(require("ndarray"));
const asyncastar_1 = require("../lib/asyncastar");
function toArrayBuffer(buf) {
    const ab = new ArrayBuffer(buf.length);
    const view = new Uint8Array(ab);
    for (let i = 0; i < buf.length; ++i) {
        view[i] = buf[i];
    }
    return ab;
}
exports.toArrayBuffer = toArrayBuffer;
const SCALE = 255.0;
const WEIGHT = 1;
const ST = 1.0;
const DG1 = 1.4142135; // root 2
const DG2 = 1.73025; // root 3
function copyNdaray(arr) {
    const arrData = arr.data.slice();
    const newArr = ndarray_1.default(arrData, arr.shape, arr.stride, arr.offset);
    return newArr;
}
exports.copyNdaray = copyNdaray;
function hash(node) {
    return `[${node.x}][${node.y}][${node.z}]`;
}
class NodeData {
    constructor(x, y, z) {
        this.x = x;
        this.y = y;
        this.z = z;
    }
    valueOf() {
        return this.toString();
    }
    toString() {
        return hash(this);
    }
}
exports.NodeData = NodeData;
function manhattan(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z);
}
function euclidean(a, b) {
    return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2) + Math.pow(a.z - b.z, 2));
}
/**
 * Octile Distance in 3 Dimensions
 * From Here: http://theory.stanford.edu/~amitp/GameProgramming/Heuristics.html
 * @param {NodeData} a
 * @param {NodeData} b
 * @returns {number}
 */
function octile(a, b) {
    const dx = Math.abs(a.x - b.x);
    const dy = Math.abs(a.y - b.y);
    const dz = Math.abs(a.z - b.z);
    const order = [dx, dy, dz];
    order.sort((n, m) => m - n);
    return order[0] * ST + (DG1 - ST) * order[1] + (DG2 - DG1) * order[2];
}
function genSuccessors(map, allowDiag = true, weight = WEIGHT, a) {
    const [width, height, depth] = [map.shape[0], map.shape[1], map.shape[2]];
    const neighbors = [];
    const transitions = [];
    // - Y TOP
    let val;
    if (a.y - 1 > 0) {
        val = map.get(a.x, a.y - 1, a.z);
        if (val !== SCALE) {
            neighbors.push(new NodeData(a.x, a.y - 1, a.z));
            transitions.push((1 + val / SCALE * weight) * ST);
        }
    }
    // -Y+X TOP-RIGHT
    if (a.y - 1 > 0 && a.x + 1 < width && allowDiag) {
        val = map.get(a.x + 1, a.y - 1, a.z);
        if (val !== SCALE) {
            neighbors.push(new NodeData(a.x + 1, a.y - 1, a.z));
            transitions.push((1 + val / SCALE * weight) * DG1);
        }
    }
    // + X RIGHT
    if (a.x + 1 < width) {
        val = map.get(a.x + 1, a.y, a.z);
        if (val !== SCALE) {
            neighbors.push(new NodeData(a.x + 1, a.y, a.z));
            transitions.push((1 + val / SCALE * weight) * ST);
        }
    }
    // + X + Y RIGHT-BOTTOM
    if (a.x + 1 < width && a.y + 1 < height && allowDiag) {
        val = map.get(a.x + 1, a.y + 1, a.z);
        if (val !== SCALE) {
            neighbors.push(new NodeData(a.x + 1, a.y + 1, a.z));
            transitions.push((1 + val / SCALE * weight) * DG1);
        }
    }
    // + Y BOTTOM
    if (a.y + 1 < height) {
        val = map.get(a.x, a.y + 1, a.z);
        if (val !== SCALE) {
            neighbors.push(new NodeData(a.x, a.y + 1, a.z));
            transitions.push((1 + val / SCALE * weight) * ST);
        }
    }
    // + Y - X BOTTOM-LEFT
    if (a.y + 1 < height && a.x - 1 > 0 && allowDiag) {
        val = map.get(a.x - 1, a.y + 1, a.z);
        if (val !== SCALE) {
            neighbors.push(new NodeData(a.x - 1, a.y + 1, a.z));
            transitions.push((1 + val / SCALE * weight) * DG1);
        }
    }
    // - X LEFT
    if (a.x - 1 > 0) {
        val = map.get(a.x - 1, a.y, a.z);
        if (val !== SCALE) {
            neighbors.push(new NodeData(a.x - 1, a.y, a.z));
            transitions.push((1 + val / SCALE * weight) * ST);
        }
    }
    // - X - Y LEFT-TOP
    if (a.x - 1 > 0 && a.y - 1 > 0 && allowDiag) {
        val = map.get(a.x - 1, a.y - 1, a.z);
        if (val !== SCALE) {
            neighbors.push(new NodeData(a.x - 1, a.y - 1, a.z));
            transitions.push((1 + val / SCALE * weight) * DG1);
        }
    }
    // 3D Path Planning!
    if (depth > 1) {
        //////// Bottom of Cube ////////////
        // - Y - Z TOP-DOWN
        if (a.y - 1 > 0 && a.z - 1 > 0) {
            val = map.get(a.x, a.y - 1, a.z - 1);
            if (val !== SCALE) {
                neighbors.push(new NodeData(a.x, a.y - 1, a.z - 1));
                transitions.push((1 + val / SCALE * weight) * DG1);
            }
        }
        // -Y+X-Z TOP-RIGHT-DOWN
        if (a.y - 1 > 0 && a.x + 1 < width && a.z - 1 > 0) {
            val = map.get(a.x + 1, a.y - 1, a.z - 1);
            if (val !== SCALE) {
                neighbors.push(new NodeData(a.x + 1, a.y - 1, a.z - 1));
                transitions.push((1 + val / SCALE * weight) * DG2);
            }
        }
        // + X-Z RIGHT DOWN
        if (a.x + 1 < width && a.z - 1 > 0) {
            val = map.get(a.x + 1, a.y, a.z - 1);
            if (val !== SCALE) {
                neighbors.push(new NodeData(a.x + 1, a.y, a.z - 1));
                transitions.push((1 + val / SCALE * weight) * DG1);
            }
        }
        // + X + Y - Z RIGHT-BOTTOM-DOWN
        if (a.x + 1 < width && a.y + 1 < height && a.z - 1 > 0) {
            val = map.get(a.x + 1, a.y + 1, a.z - 1);
            if (val !== SCALE) {
                neighbors.push(new NodeData(a.x + 1, a.y + 1, a.z - 1));
                transitions.push((1 + val / SCALE * weight) * DG2);
            }
        }
        // + Y -Z BOTTOM-DOWN
        if (a.y + 1 < height && a.z - 1 > 0) {
            val = map.get(a.x, a.y + 1, a.z - 1);
            if (val !== SCALE) {
                neighbors.push(new NodeData(a.x, a.y + 1, a.z - 1));
                transitions.push((1 + val / SCALE * weight) * DG1);
            }
        }
        // + Y - X -Z BOTTOM-LEFT-DOWN
        if (a.y + 1 < height && a.x - 1 > 0 && a.z - 1 > 0) {
            val = map.get(a.x - 1, a.y + 1, a.z - 1);
            if (val !== SCALE) {
                neighbors.push(new NodeData(a.x - 1, a.y + 1, a.z - 1));
                transitions.push((1 + val / SCALE * weight) * DG2);
            }
        }
        // - X -Z  LEFT-DOWN
        if (a.x - 1 > 0 && a.z - 1 > 0) {
            val = map.get(a.x - 1, a.y, a.z - 1);
            if (val !== SCALE) {
                neighbors.push(new NodeData(a.x - 1, a.y, a.z - 1));
                transitions.push((1 + val / SCALE * weight) * DG1);
            }
        }
        // - X - Y -Z LEFT-TOP-DOWN
        if (a.x - 1 > 0 && a.y - 1 > 0 && a.z - 1 > 0) {
            val = map.get(a.x - 1, a.y - 1, a.z - 1);
            if (val !== SCALE) {
                neighbors.push(new NodeData(a.x - 1, a.y - 1, a.z - 1));
                transitions.push((1 + val / SCALE * weight) * DG2);
            }
        }
        // -Z DOWN
        if (a.z - 1 > 0) {
            val = map.get(a.x, a.y, a.z - 1);
            if (val !== SCALE) {
                neighbors.push(new NodeData(a.x, a.y, a.z - 1));
                transitions.push((1 + val / SCALE * weight) * ST);
            }
        }
        //////// Top of Cube ////////////
        // - Y - Z TOP-UP
        if (a.y - 1 > 0 && a.z + 1 < depth) {
            val = map.get(a.x, a.y - 1, a.z + 1);
            if (val !== SCALE) {
                neighbors.push(new NodeData(a.x, a.y - 1, a.z + 1));
                transitions.push((1 + val / SCALE * weight) * DG1);
            }
        }
        // -Y+X-Z TOP-RIGHT-UP
        if (a.y - 1 > 0 && a.x + 1 < width && a.z + 1 < depth) {
            val = map.get(a.x + 1, a.y - 1, a.z + 1);
            if (val !== SCALE) {
                neighbors.push(new NodeData(a.x + 1, a.y - 1, a.z + 1));
                transitions.push((1 + val / SCALE * weight) * DG2);
            }
        }
        // + X-Z RIGHT UP
        if (a.x + 1 < width && a.z + 1 < depth) {
            val = map.get(a.x + 1, a.y, a.z + 1);
            if (val !== SCALE) {
                neighbors.push(new NodeData(a.x + 1, a.y, a.z + 1));
                transitions.push((1 + val / SCALE * weight) * DG1);
            }
        }
        // + X + Y + Z RIGHT-BOTTOM-UP
        if (a.x + 1 < width && a.y + 1 < height && a.z + 1 < depth) {
            val = map.get(a.x + 1, a.y + 1, a.z + 1);
            if (val !== SCALE) {
                neighbors.push(new NodeData(a.x + 1, a.y + 1, a.z + 1));
                transitions.push((1 + val / SCALE * weight) * DG2);
            }
        }
        // + Y + Z BOTTOM-UP
        if (a.y + 1 < height && a.z + 1 < depth) {
            val = map.get(a.x, a.y + 1, a.z + 1);
            if (val !== SCALE) {
                neighbors.push(new NodeData(a.x, a.y + 1, a.z + 1));
                transitions.push((1 + val / SCALE * weight) * DG1);
            }
        }
        // + Y - X -Z BOTTOM-LEFT-UP
        if (a.y + 1 < height && a.x - 1 > 0 && a.z + 1 < depth) {
            val = map.get(a.x - 1, a.y + 1, a.z + 1);
            if (val !== SCALE) {
                neighbors.push(new NodeData(a.x - 1, a.y + 1, a.z + 1));
                transitions.push((1 + val / SCALE * weight) * DG2);
            }
        }
        // - X -Z  LEFT-UP
        if (a.x - 1 > 0 && a.z + 1 < depth) {
            val = map.get(a.x - 1, a.y, a.z + 1);
            if (val !== SCALE) {
                neighbors.push(new NodeData(a.x - 1, a.y, a.z + 1));
                transitions.push((1 + val / SCALE * weight) * DG1);
            }
        }
        // - X - Y -Z LEFT-TOP-UP
        if (a.x - 1 > 0 && a.y - 1 > 0 && a.z + 1 < depth) {
            val = map.get(a.x - 1, a.y - 1, a.z + 1);
            if (val !== SCALE) {
                neighbors.push(new NodeData(a.x - 1, a.y - 1, a.z + 1));
                transitions.push((1 + val / SCALE * weight) * DG2);
            }
        }
        // -Z UP
        if (a.z + 1 < depth) {
            val = map.get(a.x, a.y, a.z + 1);
            if (val !== SCALE) {
                neighbors.push(new NodeData(a.x, a.y, a.z + 1));
                transitions.push((1 + val / SCALE * weight) * ST);
            }
        }
    }
    return [neighbors, transitions];
}
function stopFn(a, b) {
    return a.x === b.x && a.y === b.y && a.z === b.z;
}
function createPlanner(map, start, goal, allowDiag = true, heuristic = 'manhattan', weight = WEIGHT) {
    // Spread operator does not work with typescript here (must destructure)... (https://github.com/Microsoft/TypeScript/issues/4130)
    const [sx, sy, sz] = start;
    const [gx, gy, gz] = goal;
    const startNode = new NodeData(sx, sy, sz);
    const goalNode = new NodeData(gx, gy, gz);
    const genSuccessorsPartial = lodash_partial_1.default(genSuccessors, map, allowDiag, weight);
    let heuristicFn;
    switch (heuristic) {
        case 'manhattan':
            heuristicFn = manhattan;
            break;
        case 'euclidean':
            heuristicFn = euclidean;
            break;
        case 'octile':
            heuristicFn = octile;
            break;
        default:
            heuristicFn = manhattan;
            break;
    }
    // const heuristicFn = heuristic === 'manhattan' ? manhattan : euclidean;
    const planner = new asyncastar_1.AsyncAstar(startNode, goalNode, hash, genSuccessorsPartial, heuristicFn, stopFn);
    return planner;
}
exports.createPlanner = createPlanner;
},{"../lib/asyncastar":5,"lodash.partial":11,"ndarray":12}],7:[function(require,module,exports){
module.exports = require('./lib/heap');

},{"./lib/heap":8}],8:[function(require,module,exports){
// Generated by CoffeeScript 1.8.0
(function() {
  var Heap, defaultCmp, floor, heapify, heappop, heappush, heappushpop, heapreplace, insort, min, nlargest, nsmallest, updateItem, _siftdown, _siftup;

  floor = Math.floor, min = Math.min;


  /*
  Default comparison function to be used
   */

  defaultCmp = function(x, y) {
    if (x < y) {
      return -1;
    }
    if (x > y) {
      return 1;
    }
    return 0;
  };


  /*
  Insert item x in list a, and keep it sorted assuming a is sorted.
  
  If x is already in a, insert it to the right of the rightmost x.
  
  Optional args lo (default 0) and hi (default a.length) bound the slice
  of a to be searched.
   */

  insort = function(a, x, lo, hi, cmp) {
    var mid;
    if (lo == null) {
      lo = 0;
    }
    if (cmp == null) {
      cmp = defaultCmp;
    }
    if (lo < 0) {
      throw new Error('lo must be non-negative');
    }
    if (hi == null) {
      hi = a.length;
    }
    while (lo < hi) {
      mid = floor((lo + hi) / 2);
      if (cmp(x, a[mid]) < 0) {
        hi = mid;
      } else {
        lo = mid + 1;
      }
    }
    return ([].splice.apply(a, [lo, lo - lo].concat(x)), x);
  };


  /*
  Push item onto heap, maintaining the heap invariant.
   */

  heappush = function(array, item, cmp) {
    if (cmp == null) {
      cmp = defaultCmp;
    }
    array.push(item);
    return _siftdown(array, 0, array.length - 1, cmp);
  };


  /*
  Pop the smallest item off the heap, maintaining the heap invariant.
   */

  heappop = function(array, cmp) {
    var lastelt, returnitem;
    if (cmp == null) {
      cmp = defaultCmp;
    }
    lastelt = array.pop();
    if (array.length) {
      returnitem = array[0];
      array[0] = lastelt;
      _siftup(array, 0, cmp);
    } else {
      returnitem = lastelt;
    }
    return returnitem;
  };


  /*
  Pop and return the current smallest value, and add the new item.
  
  This is more efficient than heappop() followed by heappush(), and can be
  more appropriate when using a fixed size heap. Note that the value
  returned may be larger than item! That constrains reasonable use of
  this routine unless written as part of a conditional replacement:
      if item > array[0]
        item = heapreplace(array, item)
   */

  heapreplace = function(array, item, cmp) {
    var returnitem;
    if (cmp == null) {
      cmp = defaultCmp;
    }
    returnitem = array[0];
    array[0] = item;
    _siftup(array, 0, cmp);
    return returnitem;
  };


  /*
  Fast version of a heappush followed by a heappop.
   */

  heappushpop = function(array, item, cmp) {
    var _ref;
    if (cmp == null) {
      cmp = defaultCmp;
    }
    if (array.length && cmp(array[0], item) < 0) {
      _ref = [array[0], item], item = _ref[0], array[0] = _ref[1];
      _siftup(array, 0, cmp);
    }
    return item;
  };


  /*
  Transform list into a heap, in-place, in O(array.length) time.
   */

  heapify = function(array, cmp) {
    var i, _i, _j, _len, _ref, _ref1, _results, _results1;
    if (cmp == null) {
      cmp = defaultCmp;
    }
    _ref1 = (function() {
      _results1 = [];
      for (var _j = 0, _ref = floor(array.length / 2); 0 <= _ref ? _j < _ref : _j > _ref; 0 <= _ref ? _j++ : _j--){ _results1.push(_j); }
      return _results1;
    }).apply(this).reverse();
    _results = [];
    for (_i = 0, _len = _ref1.length; _i < _len; _i++) {
      i = _ref1[_i];
      _results.push(_siftup(array, i, cmp));
    }
    return _results;
  };


  /*
  Update the position of the given item in the heap.
  This function should be called every time the item is being modified.
   */

  updateItem = function(array, item, cmp) {
    var pos;
    if (cmp == null) {
      cmp = defaultCmp;
    }
    pos = array.indexOf(item);
    if (pos === -1) {
      return;
    }
    _siftdown(array, 0, pos, cmp);
    return _siftup(array, pos, cmp);
  };


  /*
  Find the n largest elements in a dataset.
   */

  nlargest = function(array, n, cmp) {
    var elem, result, _i, _len, _ref;
    if (cmp == null) {
      cmp = defaultCmp;
    }
    result = array.slice(0, n);
    if (!result.length) {
      return result;
    }
    heapify(result, cmp);
    _ref = array.slice(n);
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      elem = _ref[_i];
      heappushpop(result, elem, cmp);
    }
    return result.sort(cmp).reverse();
  };


  /*
  Find the n smallest elements in a dataset.
   */

  nsmallest = function(array, n, cmp) {
    var elem, i, los, result, _i, _j, _len, _ref, _ref1, _results;
    if (cmp == null) {
      cmp = defaultCmp;
    }
    if (n * 10 <= array.length) {
      result = array.slice(0, n).sort(cmp);
      if (!result.length) {
        return result;
      }
      los = result[result.length - 1];
      _ref = array.slice(n);
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        elem = _ref[_i];
        if (cmp(elem, los) < 0) {
          insort(result, elem, 0, null, cmp);
          result.pop();
          los = result[result.length - 1];
        }
      }
      return result;
    }
    heapify(array, cmp);
    _results = [];
    for (i = _j = 0, _ref1 = min(n, array.length); 0 <= _ref1 ? _j < _ref1 : _j > _ref1; i = 0 <= _ref1 ? ++_j : --_j) {
      _results.push(heappop(array, cmp));
    }
    return _results;
  };

  _siftdown = function(array, startpos, pos, cmp) {
    var newitem, parent, parentpos;
    if (cmp == null) {
      cmp = defaultCmp;
    }
    newitem = array[pos];
    while (pos > startpos) {
      parentpos = (pos - 1) >> 1;
      parent = array[parentpos];
      if (cmp(newitem, parent) < 0) {
        array[pos] = parent;
        pos = parentpos;
        continue;
      }
      break;
    }
    return array[pos] = newitem;
  };

  _siftup = function(array, pos, cmp) {
    var childpos, endpos, newitem, rightpos, startpos;
    if (cmp == null) {
      cmp = defaultCmp;
    }
    endpos = array.length;
    startpos = pos;
    newitem = array[pos];
    childpos = 2 * pos + 1;
    while (childpos < endpos) {
      rightpos = childpos + 1;
      if (rightpos < endpos && !(cmp(array[childpos], array[rightpos]) < 0)) {
        childpos = rightpos;
      }
      array[pos] = array[childpos];
      pos = childpos;
      childpos = 2 * pos + 1;
    }
    array[pos] = newitem;
    return _siftdown(array, startpos, pos, cmp);
  };

  Heap = (function() {
    Heap.push = heappush;

    Heap.pop = heappop;

    Heap.replace = heapreplace;

    Heap.pushpop = heappushpop;

    Heap.heapify = heapify;

    Heap.updateItem = updateItem;

    Heap.nlargest = nlargest;

    Heap.nsmallest = nsmallest;

    function Heap(cmp) {
      this.cmp = cmp != null ? cmp : defaultCmp;
      this.nodes = [];
    }

    Heap.prototype.push = function(x) {
      return heappush(this.nodes, x, this.cmp);
    };

    Heap.prototype.pop = function() {
      return heappop(this.nodes, this.cmp);
    };

    Heap.prototype.peek = function() {
      return this.nodes[0];
    };

    Heap.prototype.contains = function(x) {
      return this.nodes.indexOf(x) !== -1;
    };

    Heap.prototype.replace = function(x) {
      return heapreplace(this.nodes, x, this.cmp);
    };

    Heap.prototype.pushpop = function(x) {
      return heappushpop(this.nodes, x, this.cmp);
    };

    Heap.prototype.heapify = function() {
      return heapify(this.nodes, this.cmp);
    };

    Heap.prototype.updateItem = function(x) {
      return updateItem(this.nodes, x, this.cmp);
    };

    Heap.prototype.clear = function() {
      return this.nodes = [];
    };

    Heap.prototype.empty = function() {
      return this.nodes.length === 0;
    };

    Heap.prototype.size = function() {
      return this.nodes.length;
    };

    Heap.prototype.clone = function() {
      var heap;
      heap = new Heap();
      heap.nodes = this.nodes.slice(0);
      return heap;
    };

    Heap.prototype.toArray = function() {
      return this.nodes.slice(0);
    };

    Heap.prototype.insert = Heap.prototype.push;

    Heap.prototype.top = Heap.prototype.peek;

    Heap.prototype.front = Heap.prototype.peek;

    Heap.prototype.has = Heap.prototype.contains;

    Heap.prototype.copy = Heap.prototype.clone;

    return Heap;

  })();

  (function(root, factory) {
    if (typeof define === 'function' && define.amd) {
      return define([], factory);
    } else if (typeof exports === 'object') {
      return module.exports = factory();
    } else {
      return root.Heap = factory();
    }
  })(this, function() {
    return Heap;
  });

}).call(this);

},{}],9:[function(require,module,exports){
"use strict"

function iota(n) {
  var result = new Array(n)
  for(var i=0; i<n; ++i) {
    result[i] = i
  }
  return result
}

module.exports = iota
},{}],10:[function(require,module,exports){
/*!
 * Determine if an object is a Buffer
 *
 * @author   Feross Aboukhadijeh <https://feross.org>
 * @license  MIT
 */

// The _isBuffer check is for Safari 5-7 support, because it's missing
// Object.prototype.constructor. Remove this eventually
module.exports = function (obj) {
  return obj != null && (isBuffer(obj) || isSlowBuffer(obj) || !!obj._isBuffer)
}

function isBuffer (obj) {
  return !!obj.constructor && typeof obj.constructor.isBuffer === 'function' && obj.constructor.isBuffer(obj)
}

// For Node v0.10 support. Remove this eventually.
function isSlowBuffer (obj) {
  return typeof obj.readFloatLE === 'function' && typeof obj.slice === 'function' && isBuffer(obj.slice(0, 0))
}

},{}],11:[function(require,module,exports){
(function (global){
/**
 * lodash (Custom Build) <https://lodash.com/>
 * Build: `lodash modularize exports="npm" -o ./`
 * Copyright jQuery Foundation and other contributors <https://jquery.org/>
 * Released under MIT license <https://lodash.com/license>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 */

/** Used as the `TypeError` message for "Functions" methods. */
var FUNC_ERROR_TEXT = 'Expected a function';

/** Used as the internal argument placeholder. */
var PLACEHOLDER = '__lodash_placeholder__';

/** Used to compose bitmasks for function metadata. */
var BIND_FLAG = 1,
    BIND_KEY_FLAG = 2,
    CURRY_BOUND_FLAG = 4,
    CURRY_FLAG = 8,
    CURRY_RIGHT_FLAG = 16,
    PARTIAL_FLAG = 32,
    PARTIAL_RIGHT_FLAG = 64,
    ARY_FLAG = 128,
    REARG_FLAG = 256,
    FLIP_FLAG = 512;

/** Used as references for various `Number` constants. */
var INFINITY = 1 / 0,
    MAX_SAFE_INTEGER = 9007199254740991,
    MAX_INTEGER = 1.7976931348623157e+308,
    NAN = 0 / 0;

/** Used to associate wrap methods with their bit flags. */
var wrapFlags = [
  ['ary', ARY_FLAG],
  ['bind', BIND_FLAG],
  ['bindKey', BIND_KEY_FLAG],
  ['curry', CURRY_FLAG],
  ['curryRight', CURRY_RIGHT_FLAG],
  ['flip', FLIP_FLAG],
  ['partial', PARTIAL_FLAG],
  ['partialRight', PARTIAL_RIGHT_FLAG],
  ['rearg', REARG_FLAG]
];

/** `Object#toString` result references. */
var funcTag = '[object Function]',
    genTag = '[object GeneratorFunction]',
    symbolTag = '[object Symbol]';

/**
 * Used to match `RegExp`
 * [syntax characters](http://ecma-international.org/ecma-262/7.0/#sec-patterns).
 */
var reRegExpChar = /[\\^$.*+?()[\]{}|]/g;

/** Used to match leading and trailing whitespace. */
var reTrim = /^\s+|\s+$/g;

/** Used to match wrap detail comments. */
var reWrapComment = /\{(?:\n\/\* \[wrapped with .+\] \*\/)?\n?/,
    reWrapDetails = /\{\n\/\* \[wrapped with (.+)\] \*/,
    reSplitDetails = /,? & /;

/** Used to detect bad signed hexadecimal string values. */
var reIsBadHex = /^[-+]0x[0-9a-f]+$/i;

/** Used to detect binary string values. */
var reIsBinary = /^0b[01]+$/i;

/** Used to detect host constructors (Safari). */
var reIsHostCtor = /^\[object .+?Constructor\]$/;

/** Used to detect octal string values. */
var reIsOctal = /^0o[0-7]+$/i;

/** Used to detect unsigned integer values. */
var reIsUint = /^(?:0|[1-9]\d*)$/;

/** Built-in method references without a dependency on `root`. */
var freeParseInt = parseInt;

/** Detect free variable `global` from Node.js. */
var freeGlobal = typeof global == 'object' && global && global.Object === Object && global;

/** Detect free variable `self`. */
var freeSelf = typeof self == 'object' && self && self.Object === Object && self;

/** Used as a reference to the global object. */
var root = freeGlobal || freeSelf || Function('return this')();

/**
 * A faster alternative to `Function#apply`, this function invokes `func`
 * with the `this` binding of `thisArg` and the arguments of `args`.
 *
 * @private
 * @param {Function} func The function to invoke.
 * @param {*} thisArg The `this` binding of `func`.
 * @param {Array} args The arguments to invoke `func` with.
 * @returns {*} Returns the result of `func`.
 */
function apply(func, thisArg, args) {
  switch (args.length) {
    case 0: return func.call(thisArg);
    case 1: return func.call(thisArg, args[0]);
    case 2: return func.call(thisArg, args[0], args[1]);
    case 3: return func.call(thisArg, args[0], args[1], args[2]);
  }
  return func.apply(thisArg, args);
}

/**
 * A specialized version of `_.forEach` for arrays without support for
 * iteratee shorthands.
 *
 * @private
 * @param {Array} [array] The array to iterate over.
 * @param {Function} iteratee The function invoked per iteration.
 * @returns {Array} Returns `array`.
 */
function arrayEach(array, iteratee) {
  var index = -1,
      length = array ? array.length : 0;

  while (++index < length) {
    if (iteratee(array[index], index, array) === false) {
      break;
    }
  }
  return array;
}

/**
 * A specialized version of `_.includes` for arrays without support for
 * specifying an index to search from.
 *
 * @private
 * @param {Array} [array] The array to inspect.
 * @param {*} target The value to search for.
 * @returns {boolean} Returns `true` if `target` is found, else `false`.
 */
function arrayIncludes(array, value) {
  var length = array ? array.length : 0;
  return !!length && baseIndexOf(array, value, 0) > -1;
}

/**
 * The base implementation of `_.findIndex` and `_.findLastIndex` without
 * support for iteratee shorthands.
 *
 * @private
 * @param {Array} array The array to inspect.
 * @param {Function} predicate The function invoked per iteration.
 * @param {number} fromIndex The index to search from.
 * @param {boolean} [fromRight] Specify iterating from right to left.
 * @returns {number} Returns the index of the matched value, else `-1`.
 */
function baseFindIndex(array, predicate, fromIndex, fromRight) {
  var length = array.length,
      index = fromIndex + (fromRight ? 1 : -1);

  while ((fromRight ? index-- : ++index < length)) {
    if (predicate(array[index], index, array)) {
      return index;
    }
  }
  return -1;
}

/**
 * The base implementation of `_.indexOf` without `fromIndex` bounds checks.
 *
 * @private
 * @param {Array} array The array to inspect.
 * @param {*} value The value to search for.
 * @param {number} fromIndex The index to search from.
 * @returns {number} Returns the index of the matched value, else `-1`.
 */
function baseIndexOf(array, value, fromIndex) {
  if (value !== value) {
    return baseFindIndex(array, baseIsNaN, fromIndex);
  }
  var index = fromIndex - 1,
      length = array.length;

  while (++index < length) {
    if (array[index] === value) {
      return index;
    }
  }
  return -1;
}

/**
 * The base implementation of `_.isNaN` without support for number objects.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is `NaN`, else `false`.
 */
function baseIsNaN(value) {
  return value !== value;
}

/**
 * Gets the number of `placeholder` occurrences in `array`.
 *
 * @private
 * @param {Array} array The array to inspect.
 * @param {*} placeholder The placeholder to search for.
 * @returns {number} Returns the placeholder count.
 */
function countHolders(array, placeholder) {
  var length = array.length,
      result = 0;

  while (length--) {
    if (array[length] === placeholder) {
      result++;
    }
  }
  return result;
}

/**
 * Gets the value at `key` of `object`.
 *
 * @private
 * @param {Object} [object] The object to query.
 * @param {string} key The key of the property to get.
 * @returns {*} Returns the property value.
 */
function getValue(object, key) {
  return object == null ? undefined : object[key];
}

/**
 * Checks if `value` is a host object in IE < 9.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a host object, else `false`.
 */
function isHostObject(value) {
  // Many host objects are `Object` objects that can coerce to strings
  // despite having improperly defined `toString` methods.
  var result = false;
  if (value != null && typeof value.toString != 'function') {
    try {
      result = !!(value + '');
    } catch (e) {}
  }
  return result;
}

/**
 * Replaces all `placeholder` elements in `array` with an internal placeholder
 * and returns an array of their indexes.
 *
 * @private
 * @param {Array} array The array to modify.
 * @param {*} placeholder The placeholder to replace.
 * @returns {Array} Returns the new array of placeholder indexes.
 */
function replaceHolders(array, placeholder) {
  var index = -1,
      length = array.length,
      resIndex = 0,
      result = [];

  while (++index < length) {
    var value = array[index];
    if (value === placeholder || value === PLACEHOLDER) {
      array[index] = PLACEHOLDER;
      result[resIndex++] = index;
    }
  }
  return result;
}

/** Used for built-in method references. */
var funcProto = Function.prototype,
    objectProto = Object.prototype;

/** Used to detect overreaching core-js shims. */
var coreJsData = root['__core-js_shared__'];

/** Used to detect methods masquerading as native. */
var maskSrcKey = (function() {
  var uid = /[^.]+$/.exec(coreJsData && coreJsData.keys && coreJsData.keys.IE_PROTO || '');
  return uid ? ('Symbol(src)_1.' + uid) : '';
}());

/** Used to resolve the decompiled source of functions. */
var funcToString = funcProto.toString;

/** Used to check objects for own properties. */
var hasOwnProperty = objectProto.hasOwnProperty;

/**
 * Used to resolve the
 * [`toStringTag`](http://ecma-international.org/ecma-262/7.0/#sec-object.prototype.tostring)
 * of values.
 */
var objectToString = objectProto.toString;

/** Used to detect if a method is native. */
var reIsNative = RegExp('^' +
  funcToString.call(hasOwnProperty).replace(reRegExpChar, '\\$&')
  .replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, '$1.*?') + '$'
);

/** Built-in value references. */
var objectCreate = Object.create;

/* Built-in method references for those with the same name as other `lodash` methods. */
var nativeMax = Math.max,
    nativeMin = Math.min;

/* Used to set `toString` methods. */
var defineProperty = (function() {
  var func = getNative(Object, 'defineProperty'),
      name = getNative.name;

  return (name && name.length > 2) ? func : undefined;
}());

/**
 * The base implementation of `_.create` without support for assigning
 * properties to the created object.
 *
 * @private
 * @param {Object} prototype The object to inherit from.
 * @returns {Object} Returns the new object.
 */
function baseCreate(proto) {
  return isObject(proto) ? objectCreate(proto) : {};
}

/**
 * The base implementation of `_.isNative` without bad shim checks.
 *
 * @private
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a native function,
 *  else `false`.
 */
function baseIsNative(value) {
  if (!isObject(value) || isMasked(value)) {
    return false;
  }
  var pattern = (isFunction(value) || isHostObject(value)) ? reIsNative : reIsHostCtor;
  return pattern.test(toSource(value));
}

/**
 * The base implementation of `_.rest` which doesn't validate or coerce arguments.
 *
 * @private
 * @param {Function} func The function to apply a rest parameter to.
 * @param {number} [start=func.length-1] The start position of the rest parameter.
 * @returns {Function} Returns the new function.
 */
function baseRest(func, start) {
  start = nativeMax(start === undefined ? (func.length - 1) : start, 0);
  return function() {
    var args = arguments,
        index = -1,
        length = nativeMax(args.length - start, 0),
        array = Array(length);

    while (++index < length) {
      array[index] = args[start + index];
    }
    index = -1;
    var otherArgs = Array(start + 1);
    while (++index < start) {
      otherArgs[index] = args[index];
    }
    otherArgs[start] = array;
    return apply(func, this, otherArgs);
  };
}

/**
 * Creates an array that is the composition of partially applied arguments,
 * placeholders, and provided arguments into a single array of arguments.
 *
 * @private
 * @param {Array} args The provided arguments.
 * @param {Array} partials The arguments to prepend to those provided.
 * @param {Array} holders The `partials` placeholder indexes.
 * @params {boolean} [isCurried] Specify composing for a curried function.
 * @returns {Array} Returns the new array of composed arguments.
 */
function composeArgs(args, partials, holders, isCurried) {
  var argsIndex = -1,
      argsLength = args.length,
      holdersLength = holders.length,
      leftIndex = -1,
      leftLength = partials.length,
      rangeLength = nativeMax(argsLength - holdersLength, 0),
      result = Array(leftLength + rangeLength),
      isUncurried = !isCurried;

  while (++leftIndex < leftLength) {
    result[leftIndex] = partials[leftIndex];
  }
  while (++argsIndex < holdersLength) {
    if (isUncurried || argsIndex < argsLength) {
      result[holders[argsIndex]] = args[argsIndex];
    }
  }
  while (rangeLength--) {
    result[leftIndex++] = args[argsIndex++];
  }
  return result;
}

/**
 * This function is like `composeArgs` except that the arguments composition
 * is tailored for `_.partialRight`.
 *
 * @private
 * @param {Array} args The provided arguments.
 * @param {Array} partials The arguments to append to those provided.
 * @param {Array} holders The `partials` placeholder indexes.
 * @params {boolean} [isCurried] Specify composing for a curried function.
 * @returns {Array} Returns the new array of composed arguments.
 */
function composeArgsRight(args, partials, holders, isCurried) {
  var argsIndex = -1,
      argsLength = args.length,
      holdersIndex = -1,
      holdersLength = holders.length,
      rightIndex = -1,
      rightLength = partials.length,
      rangeLength = nativeMax(argsLength - holdersLength, 0),
      result = Array(rangeLength + rightLength),
      isUncurried = !isCurried;

  while (++argsIndex < rangeLength) {
    result[argsIndex] = args[argsIndex];
  }
  var offset = argsIndex;
  while (++rightIndex < rightLength) {
    result[offset + rightIndex] = partials[rightIndex];
  }
  while (++holdersIndex < holdersLength) {
    if (isUncurried || argsIndex < argsLength) {
      result[offset + holders[holdersIndex]] = args[argsIndex++];
    }
  }
  return result;
}

/**
 * Copies the values of `source` to `array`.
 *
 * @private
 * @param {Array} source The array to copy values from.
 * @param {Array} [array=[]] The array to copy values to.
 * @returns {Array} Returns `array`.
 */
function copyArray(source, array) {
  var index = -1,
      length = source.length;

  array || (array = Array(length));
  while (++index < length) {
    array[index] = source[index];
  }
  return array;
}

/**
 * Creates a function that wraps `func` to invoke it with the optional `this`
 * binding of `thisArg`.
 *
 * @private
 * @param {Function} func The function to wrap.
 * @param {number} bitmask The bitmask flags. See `createWrap` for more details.
 * @param {*} [thisArg] The `this` binding of `func`.
 * @returns {Function} Returns the new wrapped function.
 */
function createBind(func, bitmask, thisArg) {
  var isBind = bitmask & BIND_FLAG,
      Ctor = createCtor(func);

  function wrapper() {
    var fn = (this && this !== root && this instanceof wrapper) ? Ctor : func;
    return fn.apply(isBind ? thisArg : this, arguments);
  }
  return wrapper;
}

/**
 * Creates a function that produces an instance of `Ctor` regardless of
 * whether it was invoked as part of a `new` expression or by `call` or `apply`.
 *
 * @private
 * @param {Function} Ctor The constructor to wrap.
 * @returns {Function} Returns the new wrapped function.
 */
function createCtor(Ctor) {
  return function() {
    // Use a `switch` statement to work with class constructors. See
    // http://ecma-international.org/ecma-262/7.0/#sec-ecmascript-function-objects-call-thisargument-argumentslist
    // for more details.
    var args = arguments;
    switch (args.length) {
      case 0: return new Ctor;
      case 1: return new Ctor(args[0]);
      case 2: return new Ctor(args[0], args[1]);
      case 3: return new Ctor(args[0], args[1], args[2]);
      case 4: return new Ctor(args[0], args[1], args[2], args[3]);
      case 5: return new Ctor(args[0], args[1], args[2], args[3], args[4]);
      case 6: return new Ctor(args[0], args[1], args[2], args[3], args[4], args[5]);
      case 7: return new Ctor(args[0], args[1], args[2], args[3], args[4], args[5], args[6]);
    }
    var thisBinding = baseCreate(Ctor.prototype),
        result = Ctor.apply(thisBinding, args);

    // Mimic the constructor's `return` behavior.
    // See https://es5.github.io/#x13.2.2 for more details.
    return isObject(result) ? result : thisBinding;
  };
}

/**
 * Creates a function that wraps `func` to enable currying.
 *
 * @private
 * @param {Function} func The function to wrap.
 * @param {number} bitmask The bitmask flags. See `createWrap` for more details.
 * @param {number} arity The arity of `func`.
 * @returns {Function} Returns the new wrapped function.
 */
function createCurry(func, bitmask, arity) {
  var Ctor = createCtor(func);

  function wrapper() {
    var length = arguments.length,
        args = Array(length),
        index = length,
        placeholder = getHolder(wrapper);

    while (index--) {
      args[index] = arguments[index];
    }
    var holders = (length < 3 && args[0] !== placeholder && args[length - 1] !== placeholder)
      ? []
      : replaceHolders(args, placeholder);

    length -= holders.length;
    if (length < arity) {
      return createRecurry(
        func, bitmask, createHybrid, wrapper.placeholder, undefined,
        args, holders, undefined, undefined, arity - length);
    }
    var fn = (this && this !== root && this instanceof wrapper) ? Ctor : func;
    return apply(fn, this, args);
  }
  return wrapper;
}

/**
 * Creates a function that wraps `func` to invoke it with optional `this`
 * binding of `thisArg`, partial application, and currying.
 *
 * @private
 * @param {Function|string} func The function or method name to wrap.
 * @param {number} bitmask The bitmask flags. See `createWrap` for more details.
 * @param {*} [thisArg] The `this` binding of `func`.
 * @param {Array} [partials] The arguments to prepend to those provided to
 *  the new function.
 * @param {Array} [holders] The `partials` placeholder indexes.
 * @param {Array} [partialsRight] The arguments to append to those provided
 *  to the new function.
 * @param {Array} [holdersRight] The `partialsRight` placeholder indexes.
 * @param {Array} [argPos] The argument positions of the new function.
 * @param {number} [ary] The arity cap of `func`.
 * @param {number} [arity] The arity of `func`.
 * @returns {Function} Returns the new wrapped function.
 */
function createHybrid(func, bitmask, thisArg, partials, holders, partialsRight, holdersRight, argPos, ary, arity) {
  var isAry = bitmask & ARY_FLAG,
      isBind = bitmask & BIND_FLAG,
      isBindKey = bitmask & BIND_KEY_FLAG,
      isCurried = bitmask & (CURRY_FLAG | CURRY_RIGHT_FLAG),
      isFlip = bitmask & FLIP_FLAG,
      Ctor = isBindKey ? undefined : createCtor(func);

  function wrapper() {
    var length = arguments.length,
        args = Array(length),
        index = length;

    while (index--) {
      args[index] = arguments[index];
    }
    if (isCurried) {
      var placeholder = getHolder(wrapper),
          holdersCount = countHolders(args, placeholder);
    }
    if (partials) {
      args = composeArgs(args, partials, holders, isCurried);
    }
    if (partialsRight) {
      args = composeArgsRight(args, partialsRight, holdersRight, isCurried);
    }
    length -= holdersCount;
    if (isCurried && length < arity) {
      var newHolders = replaceHolders(args, placeholder);
      return createRecurry(
        func, bitmask, createHybrid, wrapper.placeholder, thisArg,
        args, newHolders, argPos, ary, arity - length
      );
    }
    var thisBinding = isBind ? thisArg : this,
        fn = isBindKey ? thisBinding[func] : func;

    length = args.length;
    if (argPos) {
      args = reorder(args, argPos);
    } else if (isFlip && length > 1) {
      args.reverse();
    }
    if (isAry && ary < length) {
      args.length = ary;
    }
    if (this && this !== root && this instanceof wrapper) {
      fn = Ctor || createCtor(fn);
    }
    return fn.apply(thisBinding, args);
  }
  return wrapper;
}

/**
 * Creates a function that wraps `func` to invoke it with the `this` binding
 * of `thisArg` and `partials` prepended to the arguments it receives.
 *
 * @private
 * @param {Function} func The function to wrap.
 * @param {number} bitmask The bitmask flags. See `createWrap` for more details.
 * @param {*} thisArg The `this` binding of `func`.
 * @param {Array} partials The arguments to prepend to those provided to
 *  the new function.
 * @returns {Function} Returns the new wrapped function.
 */
function createPartial(func, bitmask, thisArg, partials) {
  var isBind = bitmask & BIND_FLAG,
      Ctor = createCtor(func);

  function wrapper() {
    var argsIndex = -1,
        argsLength = arguments.length,
        leftIndex = -1,
        leftLength = partials.length,
        args = Array(leftLength + argsLength),
        fn = (this && this !== root && this instanceof wrapper) ? Ctor : func;

    while (++leftIndex < leftLength) {
      args[leftIndex] = partials[leftIndex];
    }
    while (argsLength--) {
      args[leftIndex++] = arguments[++argsIndex];
    }
    return apply(fn, isBind ? thisArg : this, args);
  }
  return wrapper;
}

/**
 * Creates a function that wraps `func` to continue currying.
 *
 * @private
 * @param {Function} func The function to wrap.
 * @param {number} bitmask The bitmask flags. See `createWrap` for more details.
 * @param {Function} wrapFunc The function to create the `func` wrapper.
 * @param {*} placeholder The placeholder value.
 * @param {*} [thisArg] The `this` binding of `func`.
 * @param {Array} [partials] The arguments to prepend to those provided to
 *  the new function.
 * @param {Array} [holders] The `partials` placeholder indexes.
 * @param {Array} [argPos] The argument positions of the new function.
 * @param {number} [ary] The arity cap of `func`.
 * @param {number} [arity] The arity of `func`.
 * @returns {Function} Returns the new wrapped function.
 */
function createRecurry(func, bitmask, wrapFunc, placeholder, thisArg, partials, holders, argPos, ary, arity) {
  var isCurry = bitmask & CURRY_FLAG,
      newHolders = isCurry ? holders : undefined,
      newHoldersRight = isCurry ? undefined : holders,
      newPartials = isCurry ? partials : undefined,
      newPartialsRight = isCurry ? undefined : partials;

  bitmask |= (isCurry ? PARTIAL_FLAG : PARTIAL_RIGHT_FLAG);
  bitmask &= ~(isCurry ? PARTIAL_RIGHT_FLAG : PARTIAL_FLAG);

  if (!(bitmask & CURRY_BOUND_FLAG)) {
    bitmask &= ~(BIND_FLAG | BIND_KEY_FLAG);
  }

  var result = wrapFunc(func, bitmask, thisArg, newPartials, newHolders, newPartialsRight, newHoldersRight, argPos, ary, arity);
  result.placeholder = placeholder;
  return setWrapToString(result, func, bitmask);
}

/**
 * Creates a function that either curries or invokes `func` with optional
 * `this` binding and partially applied arguments.
 *
 * @private
 * @param {Function|string} func The function or method name to wrap.
 * @param {number} bitmask The bitmask flags.
 *  The bitmask may be composed of the following flags:
 *     1 - `_.bind`
 *     2 - `_.bindKey`
 *     4 - `_.curry` or `_.curryRight` of a bound function
 *     8 - `_.curry`
 *    16 - `_.curryRight`
 *    32 - `_.partial`
 *    64 - `_.partialRight`
 *   128 - `_.rearg`
 *   256 - `_.ary`
 *   512 - `_.flip`
 * @param {*} [thisArg] The `this` binding of `func`.
 * @param {Array} [partials] The arguments to be partially applied.
 * @param {Array} [holders] The `partials` placeholder indexes.
 * @param {Array} [argPos] The argument positions of the new function.
 * @param {number} [ary] The arity cap of `func`.
 * @param {number} [arity] The arity of `func`.
 * @returns {Function} Returns the new wrapped function.
 */
function createWrap(func, bitmask, thisArg, partials, holders, argPos, ary, arity) {
  var isBindKey = bitmask & BIND_KEY_FLAG;
  if (!isBindKey && typeof func != 'function') {
    throw new TypeError(FUNC_ERROR_TEXT);
  }
  var length = partials ? partials.length : 0;
  if (!length) {
    bitmask &= ~(PARTIAL_FLAG | PARTIAL_RIGHT_FLAG);
    partials = holders = undefined;
  }
  ary = ary === undefined ? ary : nativeMax(toInteger(ary), 0);
  arity = arity === undefined ? arity : toInteger(arity);
  length -= holders ? holders.length : 0;

  if (bitmask & PARTIAL_RIGHT_FLAG) {
    var partialsRight = partials,
        holdersRight = holders;

    partials = holders = undefined;
  }

  var newData = [
    func, bitmask, thisArg, partials, holders, partialsRight, holdersRight,
    argPos, ary, arity
  ];

  func = newData[0];
  bitmask = newData[1];
  thisArg = newData[2];
  partials = newData[3];
  holders = newData[4];
  arity = newData[9] = newData[9] == null
    ? (isBindKey ? 0 : func.length)
    : nativeMax(newData[9] - length, 0);

  if (!arity && bitmask & (CURRY_FLAG | CURRY_RIGHT_FLAG)) {
    bitmask &= ~(CURRY_FLAG | CURRY_RIGHT_FLAG);
  }
  if (!bitmask || bitmask == BIND_FLAG) {
    var result = createBind(func, bitmask, thisArg);
  } else if (bitmask == CURRY_FLAG || bitmask == CURRY_RIGHT_FLAG) {
    result = createCurry(func, bitmask, arity);
  } else if ((bitmask == PARTIAL_FLAG || bitmask == (BIND_FLAG | PARTIAL_FLAG)) && !holders.length) {
    result = createPartial(func, bitmask, thisArg, partials);
  } else {
    result = createHybrid.apply(undefined, newData);
  }
  return setWrapToString(result, func, bitmask);
}

/**
 * Gets the argument placeholder value for `func`.
 *
 * @private
 * @param {Function} func The function to inspect.
 * @returns {*} Returns the placeholder value.
 */
function getHolder(func) {
  var object = func;
  return object.placeholder;
}

/**
 * Gets the native function at `key` of `object`.
 *
 * @private
 * @param {Object} object The object to query.
 * @param {string} key The key of the method to get.
 * @returns {*} Returns the function if it's native, else `undefined`.
 */
function getNative(object, key) {
  var value = getValue(object, key);
  return baseIsNative(value) ? value : undefined;
}

/**
 * Extracts wrapper details from the `source` body comment.
 *
 * @private
 * @param {string} source The source to inspect.
 * @returns {Array} Returns the wrapper details.
 */
function getWrapDetails(source) {
  var match = source.match(reWrapDetails);
  return match ? match[1].split(reSplitDetails) : [];
}

/**
 * Inserts wrapper `details` in a comment at the top of the `source` body.
 *
 * @private
 * @param {string} source The source to modify.
 * @returns {Array} details The details to insert.
 * @returns {string} Returns the modified source.
 */
function insertWrapDetails(source, details) {
  var length = details.length,
      lastIndex = length - 1;

  details[lastIndex] = (length > 1 ? '& ' : '') + details[lastIndex];
  details = details.join(length > 2 ? ', ' : ' ');
  return source.replace(reWrapComment, '{\n/* [wrapped with ' + details + '] */\n');
}

/**
 * Checks if `value` is a valid array-like index.
 *
 * @private
 * @param {*} value The value to check.
 * @param {number} [length=MAX_SAFE_INTEGER] The upper bounds of a valid index.
 * @returns {boolean} Returns `true` if `value` is a valid index, else `false`.
 */
function isIndex(value, length) {
  length = length == null ? MAX_SAFE_INTEGER : length;
  return !!length &&
    (typeof value == 'number' || reIsUint.test(value)) &&
    (value > -1 && value % 1 == 0 && value < length);
}

/**
 * Checks if `func` has its source masked.
 *
 * @private
 * @param {Function} func The function to check.
 * @returns {boolean} Returns `true` if `func` is masked, else `false`.
 */
function isMasked(func) {
  return !!maskSrcKey && (maskSrcKey in func);
}

/**
 * Reorder `array` according to the specified indexes where the element at
 * the first index is assigned as the first element, the element at
 * the second index is assigned as the second element, and so on.
 *
 * @private
 * @param {Array} array The array to reorder.
 * @param {Array} indexes The arranged array indexes.
 * @returns {Array} Returns `array`.
 */
function reorder(array, indexes) {
  var arrLength = array.length,
      length = nativeMin(indexes.length, arrLength),
      oldArray = copyArray(array);

  while (length--) {
    var index = indexes[length];
    array[length] = isIndex(index, arrLength) ? oldArray[index] : undefined;
  }
  return array;
}

/**
 * Sets the `toString` method of `wrapper` to mimic the source of `reference`
 * with wrapper details in a comment at the top of the source body.
 *
 * @private
 * @param {Function} wrapper The function to modify.
 * @param {Function} reference The reference function.
 * @param {number} bitmask The bitmask flags. See `createWrap` for more details.
 * @returns {Function} Returns `wrapper`.
 */
var setWrapToString = !defineProperty ? identity : function(wrapper, reference, bitmask) {
  var source = (reference + '');
  return defineProperty(wrapper, 'toString', {
    'configurable': true,
    'enumerable': false,
    'value': constant(insertWrapDetails(source, updateWrapDetails(getWrapDetails(source), bitmask)))
  });
};

/**
 * Converts `func` to its source code.
 *
 * @private
 * @param {Function} func The function to process.
 * @returns {string} Returns the source code.
 */
function toSource(func) {
  if (func != null) {
    try {
      return funcToString.call(func);
    } catch (e) {}
    try {
      return (func + '');
    } catch (e) {}
  }
  return '';
}

/**
 * Updates wrapper `details` based on `bitmask` flags.
 *
 * @private
 * @returns {Array} details The details to modify.
 * @param {number} bitmask The bitmask flags. See `createWrap` for more details.
 * @returns {Array} Returns `details`.
 */
function updateWrapDetails(details, bitmask) {
  arrayEach(wrapFlags, function(pair) {
    var value = '_.' + pair[0];
    if ((bitmask & pair[1]) && !arrayIncludes(details, value)) {
      details.push(value);
    }
  });
  return details.sort();
}

/**
 * Creates a function that invokes `func` with `partials` prepended to the
 * arguments it receives. This method is like `_.bind` except it does **not**
 * alter the `this` binding.
 *
 * The `_.partial.placeholder` value, which defaults to `_` in monolithic
 * builds, may be used as a placeholder for partially applied arguments.
 *
 * **Note:** This method doesn't set the "length" property of partially
 * applied functions.
 *
 * @static
 * @memberOf _
 * @since 0.2.0
 * @category Function
 * @param {Function} func The function to partially apply arguments to.
 * @param {...*} [partials] The arguments to be partially applied.
 * @returns {Function} Returns the new partially applied function.
 * @example
 *
 * function greet(greeting, name) {
 *   return greeting + ' ' + name;
 * }
 *
 * var sayHelloTo = _.partial(greet, 'hello');
 * sayHelloTo('fred');
 * // => 'hello fred'
 *
 * // Partially applied with placeholders.
 * var greetFred = _.partial(greet, _, 'fred');
 * greetFred('hi');
 * // => 'hi fred'
 */
var partial = baseRest(function(func, partials) {
  var holders = replaceHolders(partials, getHolder(partial));
  return createWrap(func, PARTIAL_FLAG, undefined, partials, holders);
});

/**
 * Checks if `value` is classified as a `Function` object.
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a function, else `false`.
 * @example
 *
 * _.isFunction(_);
 * // => true
 *
 * _.isFunction(/abc/);
 * // => false
 */
function isFunction(value) {
  // The use of `Object#toString` avoids issues with the `typeof` operator
  // in Safari 8-9 which returns 'object' for typed array and other constructors.
  var tag = isObject(value) ? objectToString.call(value) : '';
  return tag == funcTag || tag == genTag;
}

/**
 * Checks if `value` is the
 * [language type](http://www.ecma-international.org/ecma-262/7.0/#sec-ecmascript-language-types)
 * of `Object`. (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
 *
 * @static
 * @memberOf _
 * @since 0.1.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is an object, else `false`.
 * @example
 *
 * _.isObject({});
 * // => true
 *
 * _.isObject([1, 2, 3]);
 * // => true
 *
 * _.isObject(_.noop);
 * // => true
 *
 * _.isObject(null);
 * // => false
 */
function isObject(value) {
  var type = typeof value;
  return !!value && (type == 'object' || type == 'function');
}

/**
 * Checks if `value` is object-like. A value is object-like if it's not `null`
 * and has a `typeof` result of "object".
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
 * @example
 *
 * _.isObjectLike({});
 * // => true
 *
 * _.isObjectLike([1, 2, 3]);
 * // => true
 *
 * _.isObjectLike(_.noop);
 * // => false
 *
 * _.isObjectLike(null);
 * // => false
 */
function isObjectLike(value) {
  return !!value && typeof value == 'object';
}

/**
 * Checks if `value` is classified as a `Symbol` primitive or object.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is a symbol, else `false`.
 * @example
 *
 * _.isSymbol(Symbol.iterator);
 * // => true
 *
 * _.isSymbol('abc');
 * // => false
 */
function isSymbol(value) {
  return typeof value == 'symbol' ||
    (isObjectLike(value) && objectToString.call(value) == symbolTag);
}

/**
 * Converts `value` to a finite number.
 *
 * @static
 * @memberOf _
 * @since 4.12.0
 * @category Lang
 * @param {*} value The value to convert.
 * @returns {number} Returns the converted number.
 * @example
 *
 * _.toFinite(3.2);
 * // => 3.2
 *
 * _.toFinite(Number.MIN_VALUE);
 * // => 5e-324
 *
 * _.toFinite(Infinity);
 * // => 1.7976931348623157e+308
 *
 * _.toFinite('3.2');
 * // => 3.2
 */
function toFinite(value) {
  if (!value) {
    return value === 0 ? value : 0;
  }
  value = toNumber(value);
  if (value === INFINITY || value === -INFINITY) {
    var sign = (value < 0 ? -1 : 1);
    return sign * MAX_INTEGER;
  }
  return value === value ? value : 0;
}

/**
 * Converts `value` to an integer.
 *
 * **Note:** This method is loosely based on
 * [`ToInteger`](http://www.ecma-international.org/ecma-262/7.0/#sec-tointeger).
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to convert.
 * @returns {number} Returns the converted integer.
 * @example
 *
 * _.toInteger(3.2);
 * // => 3
 *
 * _.toInteger(Number.MIN_VALUE);
 * // => 0
 *
 * _.toInteger(Infinity);
 * // => 1.7976931348623157e+308
 *
 * _.toInteger('3.2');
 * // => 3
 */
function toInteger(value) {
  var result = toFinite(value),
      remainder = result % 1;

  return result === result ? (remainder ? result - remainder : result) : 0;
}

/**
 * Converts `value` to a number.
 *
 * @static
 * @memberOf _
 * @since 4.0.0
 * @category Lang
 * @param {*} value The value to process.
 * @returns {number} Returns the number.
 * @example
 *
 * _.toNumber(3.2);
 * // => 3.2
 *
 * _.toNumber(Number.MIN_VALUE);
 * // => 5e-324
 *
 * _.toNumber(Infinity);
 * // => Infinity
 *
 * _.toNumber('3.2');
 * // => 3.2
 */
function toNumber(value) {
  if (typeof value == 'number') {
    return value;
  }
  if (isSymbol(value)) {
    return NAN;
  }
  if (isObject(value)) {
    var other = typeof value.valueOf == 'function' ? value.valueOf() : value;
    value = isObject(other) ? (other + '') : other;
  }
  if (typeof value != 'string') {
    return value === 0 ? value : +value;
  }
  value = value.replace(reTrim, '');
  var isBinary = reIsBinary.test(value);
  return (isBinary || reIsOctal.test(value))
    ? freeParseInt(value.slice(2), isBinary ? 2 : 8)
    : (reIsBadHex.test(value) ? NAN : +value);
}

/**
 * Creates a function that returns `value`.
 *
 * @static
 * @memberOf _
 * @since 2.4.0
 * @category Util
 * @param {*} value The value to return from the new function.
 * @returns {Function} Returns the new constant function.
 * @example
 *
 * var objects = _.times(2, _.constant({ 'a': 1 }));
 *
 * console.log(objects);
 * // => [{ 'a': 1 }, { 'a': 1 }]
 *
 * console.log(objects[0] === objects[1]);
 * // => true
 */
function constant(value) {
  return function() {
    return value;
  };
}

/**
 * This method returns the first argument it receives.
 *
 * @static
 * @since 0.1.0
 * @memberOf _
 * @category Util
 * @param {*} value Any value.
 * @returns {*} Returns `value`.
 * @example
 *
 * var object = { 'a': 1 };
 *
 * console.log(_.identity(object) === object);
 * // => true
 */
function identity(value) {
  return value;
}

// Assign default placeholders.
partial.placeholder = {};

module.exports = partial;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],12:[function(require,module,exports){
var iota = require("iota-array")
var isBuffer = require("is-buffer")

var hasTypedArrays  = ((typeof Float64Array) !== "undefined")

function compare1st(a, b) {
  return a[0] - b[0]
}

function order() {
  var stride = this.stride
  var terms = new Array(stride.length)
  var i
  for(i=0; i<terms.length; ++i) {
    terms[i] = [Math.abs(stride[i]), i]
  }
  terms.sort(compare1st)
  var result = new Array(terms.length)
  for(i=0; i<result.length; ++i) {
    result[i] = terms[i][1]
  }
  return result
}

function compileConstructor(dtype, dimension) {
  var className = ["View", dimension, "d", dtype].join("")
  if(dimension < 0) {
    className = "View_Nil" + dtype
  }
  var useGetters = (dtype === "generic")

  if(dimension === -1) {
    //Special case for trivial arrays
    var code =
      "function "+className+"(a){this.data=a;};\
var proto="+className+".prototype;\
proto.dtype='"+dtype+"';\
proto.index=function(){return -1};\
proto.size=0;\
proto.dimension=-1;\
proto.shape=proto.stride=proto.order=[];\
proto.lo=proto.hi=proto.transpose=proto.step=\
function(){return new "+className+"(this.data);};\
proto.get=proto.set=function(){};\
proto.pick=function(){return null};\
return function construct_"+className+"(a){return new "+className+"(a);}"
    var procedure = new Function(code)
    return procedure()
  } else if(dimension === 0) {
    //Special case for 0d arrays
    var code =
      "function "+className+"(a,d) {\
this.data = a;\
this.offset = d\
};\
var proto="+className+".prototype;\
proto.dtype='"+dtype+"';\
proto.index=function(){return this.offset};\
proto.dimension=0;\
proto.size=1;\
proto.shape=\
proto.stride=\
proto.order=[];\
proto.lo=\
proto.hi=\
proto.transpose=\
proto.step=function "+className+"_copy() {\
return new "+className+"(this.data,this.offset)\
};\
proto.pick=function "+className+"_pick(){\
return TrivialArray(this.data);\
};\
proto.valueOf=proto.get=function "+className+"_get(){\
return "+(useGetters ? "this.data.get(this.offset)" : "this.data[this.offset]")+
"};\
proto.set=function "+className+"_set(v){\
return "+(useGetters ? "this.data.set(this.offset,v)" : "this.data[this.offset]=v")+"\
};\
return function construct_"+className+"(a,b,c,d){return new "+className+"(a,d)}"
    var procedure = new Function("TrivialArray", code)
    return procedure(CACHED_CONSTRUCTORS[dtype][0])
  }

  var code = ["'use strict'"]

  //Create constructor for view
  var indices = iota(dimension)
  var args = indices.map(function(i) { return "i"+i })
  var index_str = "this.offset+" + indices.map(function(i) {
        return "this.stride[" + i + "]*i" + i
      }).join("+")
  var shapeArg = indices.map(function(i) {
      return "b"+i
    }).join(",")
  var strideArg = indices.map(function(i) {
      return "c"+i
    }).join(",")
  code.push(
    "function "+className+"(a," + shapeArg + "," + strideArg + ",d){this.data=a",
      "this.shape=[" + shapeArg + "]",
      "this.stride=[" + strideArg + "]",
      "this.offset=d|0}",
    "var proto="+className+".prototype",
    "proto.dtype='"+dtype+"'",
    "proto.dimension="+dimension)

  //view.size:
  code.push("Object.defineProperty(proto,'size',{get:function "+className+"_size(){\
return "+indices.map(function(i) { return "this.shape["+i+"]" }).join("*"),
"}})")

  //view.order:
  if(dimension === 1) {
    code.push("proto.order=[0]")
  } else {
    code.push("Object.defineProperty(proto,'order',{get:")
    if(dimension < 4) {
      code.push("function "+className+"_order(){")
      if(dimension === 2) {
        code.push("return (Math.abs(this.stride[0])>Math.abs(this.stride[1]))?[1,0]:[0,1]}})")
      } else if(dimension === 3) {
        code.push(
"var s0=Math.abs(this.stride[0]),s1=Math.abs(this.stride[1]),s2=Math.abs(this.stride[2]);\
if(s0>s1){\
if(s1>s2){\
return [2,1,0];\
}else if(s0>s2){\
return [1,2,0];\
}else{\
return [1,0,2];\
}\
}else if(s0>s2){\
return [2,0,1];\
}else if(s2>s1){\
return [0,1,2];\
}else{\
return [0,2,1];\
}}})")
      }
    } else {
      code.push("ORDER})")
    }
  }

  //view.set(i0, ..., v):
  code.push(
"proto.set=function "+className+"_set("+args.join(",")+",v){")
  if(useGetters) {
    code.push("return this.data.set("+index_str+",v)}")
  } else {
    code.push("return this.data["+index_str+"]=v}")
  }

  //view.get(i0, ...):
  code.push("proto.get=function "+className+"_get("+args.join(",")+"){")
  if(useGetters) {
    code.push("return this.data.get("+index_str+")}")
  } else {
    code.push("return this.data["+index_str+"]}")
  }

  //view.index:
  code.push(
    "proto.index=function "+className+"_index(", args.join(), "){return "+index_str+"}")

  //view.hi():
  code.push("proto.hi=function "+className+"_hi("+args.join(",")+"){return new "+className+"(this.data,"+
    indices.map(function(i) {
      return ["(typeof i",i,"!=='number'||i",i,"<0)?this.shape[", i, "]:i", i,"|0"].join("")
    }).join(",")+","+
    indices.map(function(i) {
      return "this.stride["+i + "]"
    }).join(",")+",this.offset)}")

  //view.lo():
  var a_vars = indices.map(function(i) { return "a"+i+"=this.shape["+i+"]" })
  var c_vars = indices.map(function(i) { return "c"+i+"=this.stride["+i+"]" })
  code.push("proto.lo=function "+className+"_lo("+args.join(",")+"){var b=this.offset,d=0,"+a_vars.join(",")+","+c_vars.join(","))
  for(var i=0; i<dimension; ++i) {
    code.push(
"if(typeof i"+i+"==='number'&&i"+i+">=0){\
d=i"+i+"|0;\
b+=c"+i+"*d;\
a"+i+"-=d}")
  }
  code.push("return new "+className+"(this.data,"+
    indices.map(function(i) {
      return "a"+i
    }).join(",")+","+
    indices.map(function(i) {
      return "c"+i
    }).join(",")+",b)}")

  //view.step():
  code.push("proto.step=function "+className+"_step("+args.join(",")+"){var "+
    indices.map(function(i) {
      return "a"+i+"=this.shape["+i+"]"
    }).join(",")+","+
    indices.map(function(i) {
      return "b"+i+"=this.stride["+i+"]"
    }).join(",")+",c=this.offset,d=0,ceil=Math.ceil")
  for(var i=0; i<dimension; ++i) {
    code.push(
"if(typeof i"+i+"==='number'){\
d=i"+i+"|0;\
if(d<0){\
c+=b"+i+"*(a"+i+"-1);\
a"+i+"=ceil(-a"+i+"/d)\
}else{\
a"+i+"=ceil(a"+i+"/d)\
}\
b"+i+"*=d\
}")
  }
  code.push("return new "+className+"(this.data,"+
    indices.map(function(i) {
      return "a" + i
    }).join(",")+","+
    indices.map(function(i) {
      return "b" + i
    }).join(",")+",c)}")

  //view.transpose():
  var tShape = new Array(dimension)
  var tStride = new Array(dimension)
  for(var i=0; i<dimension; ++i) {
    tShape[i] = "a[i"+i+"]"
    tStride[i] = "b[i"+i+"]"
  }
  code.push("proto.transpose=function "+className+"_transpose("+args+"){"+
    args.map(function(n,idx) { return n + "=(" + n + "===undefined?" + idx + ":" + n + "|0)"}).join(";"),
    "var a=this.shape,b=this.stride;return new "+className+"(this.data,"+tShape.join(",")+","+tStride.join(",")+",this.offset)}")

  //view.pick():
  code.push("proto.pick=function "+className+"_pick("+args+"){var a=[],b=[],c=this.offset")
  for(var i=0; i<dimension; ++i) {
    code.push("if(typeof i"+i+"==='number'&&i"+i+">=0){c=(c+this.stride["+i+"]*i"+i+")|0}else{a.push(this.shape["+i+"]);b.push(this.stride["+i+"])}")
  }
  code.push("var ctor=CTOR_LIST[a.length+1];return ctor(this.data,a,b,c)}")

  //Add return statement
  code.push("return function construct_"+className+"(data,shape,stride,offset){return new "+className+"(data,"+
    indices.map(function(i) {
      return "shape["+i+"]"
    }).join(",")+","+
    indices.map(function(i) {
      return "stride["+i+"]"
    }).join(",")+",offset)}")

  //Compile procedure
  var procedure = new Function("CTOR_LIST", "ORDER", code.join("\n"))
  return procedure(CACHED_CONSTRUCTORS[dtype], order)
}

function arrayDType(data) {
  if(isBuffer(data)) {
    return "buffer"
  }
  if(hasTypedArrays) {
    switch(Object.prototype.toString.call(data)) {
      case "[object Float64Array]":
        return "float64"
      case "[object Float32Array]":
        return "float32"
      case "[object Int8Array]":
        return "int8"
      case "[object Int16Array]":
        return "int16"
      case "[object Int32Array]":
        return "int32"
      case "[object Uint8Array]":
        return "uint8"
      case "[object Uint16Array]":
        return "uint16"
      case "[object Uint32Array]":
        return "uint32"
      case "[object Uint8ClampedArray]":
        return "uint8_clamped"
    }
  }
  if(Array.isArray(data)) {
    return "array"
  }
  return "generic"
}

var CACHED_CONSTRUCTORS = {
  "float32":[],
  "float64":[],
  "int8":[],
  "int16":[],
  "int32":[],
  "uint8":[],
  "uint16":[],
  "uint32":[],
  "array":[],
  "uint8_clamped":[],
  "buffer":[],
  "generic":[]
}

;(function() {
  for(var id in CACHED_CONSTRUCTORS) {
    CACHED_CONSTRUCTORS[id].push(compileConstructor(id, -1))
  }
});

function wrappedNDArrayCtor(data, shape, stride, offset) {
  if(data === undefined) {
    var ctor = CACHED_CONSTRUCTORS.array[0]
    return ctor([])
  } else if(typeof data === "number") {
    data = [data]
  }
  if(shape === undefined) {
    shape = [ data.length ]
  }
  var d = shape.length
  if(stride === undefined) {
    stride = new Array(d)
    for(var i=d-1, sz=1; i>=0; --i) {
      stride[i] = sz
      sz *= shape[i]
    }
  }
  if(offset === undefined) {
    offset = 0
    for(var i=0; i<d; ++i) {
      if(stride[i] < 0) {
        offset -= (shape[i]-1)*stride[i]
      }
    }
  }
  var dtype = arrayDType(data)
  var ctor_list = CACHED_CONSTRUCTORS[dtype]
  while(ctor_list.length <= d+1) {
    ctor_list.push(compileConstructor(dtype, ctor_list.length-1))
  }
  var ctor = ctor_list[d+1]
  return ctor(data, shape, stride, offset)
}

module.exports = wrappedNDArrayCtor

},{"iota-array":9,"is-buffer":10}],13:[function(require,module,exports){

function asciiDecode(buffer) {
  const castBuffer = new Uint8Array(buffer);
  return String.fromCharCode(...castBuffer);
}

function readUint16LE(buffer) {
    const view = new DataView(buffer);
    var value = view.getUint8(0);
    value |= view.getUint8(1) << 8;
    return value;
}

function typedArrayFromBuffer(dtype, buffer, offset) {
  switch (dtype) {
    // Unsigned Integer
    case '|u1':
      return new Uint8Array(buffer, offset);
    case '<u2':
      return new UInt16Array(buffer, offset);
    case '<u4':
      return new UInt32Array(buffer, offset);
    // Integer
    case '|i1':
      return new Int8Array(buffer, offset);
    case '<i2':
      return new Int16rray(buffer, offset);
    case '<i4':
      return new Int32Array(buffer, offset);
    // Floating Point
    case '<f4':
      return new Float32Array(buffer, offset);
    case '<f8':
      return new Float64Array(buffer, offset);

    default:
      throw new Error('unknown numeric dtype: ' + header.descr);
  }
}

function fromArrayBuffer(buffer) {
  // check the magic number
  const magic = asciiDecode(buffer.slice(0,6));
  if (magic.slice(1,6) != 'NUMPY') {
      throw new Error(`unknown file type: "${magic}"`);
  }

  // read the header
  const version = new Uint8Array(buffer.slice(6, 8)),
        headerLength = readUint16LE(buffer.slice(8, 10)),
        headerStr = asciiDecode(buffer.slice(10, 10 + headerLength)),
        offsetBytes = 10 + headerLength;
  const jsonHeader = headerStr
    .toLowerCase() // fixes boolean literals: False -> false
    .replace('(','[').replace('),',']') // shape tuple to array: (10,) -> [10,]
    .replace('[,','[1,]').replace(',]',',1]') // implicit dimensions: [10,] -> [10,1]
    .replace(/'/g, '"'); // fixes single quotes
  const header = JSON.parse(jsonHeader);
  if (header.fortran_order) {
    // TODO: figure out if/how to handle this
    throw new Error('file is in Fortran byte order; giving up')
  }

  // Intepret the bytes according to the specified dtype
  const data = typedArrayFromBuffer(header.descr, buffer, offsetBytes);

  return { data: data, shape: header.shape };
}

module.exports = {
    fromArrayBuffer: fromArrayBuffer
};

},{}]},{},[1]);
