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

const {plan, createPlanner} = require('./planning')

// These are loaders from THREEJS to load objects, textures, or general files
const OBJ_LOADER = new THREE.ObjectLoader();
const TEXTURE_LOADER = new THREE.TextureLoader();
const FILE_LOADER = new THREE.FileLoader();

// These are the starting coordinates of the UAS in spherical and THREEJS coordinate sytems
const STARTING_POSITION_SPHERICAL = [7.33364, 51.436723, 133.67];
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
      until: 3.7,
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

    loadNumpy('./custom/data/cost_map.npy').then((data) => {
      console.log(data)
      createPlanner(data, STARTING_POSITION_SPHERICAL)
    })
  });
}

function addStars(path_vectors, star_template) {
  // Need to add a dummy group around the star so that it can be displaced instead of teh mesh
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
  scope.parameters.planner = { speed: 1, active: false};
  
  folder.add(scope.parameters.planner, "speed", 0, 20, 1).name("Speed");
  folder.add(scope.parameters.planner, "active").name("Active");
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
