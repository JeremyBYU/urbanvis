// @ts-check
// Make this global
/**
*  @type {object}
*/
var app, THREE, quad_group, Q3D


const OBJ_LOADER = new THREE.ObjectLoader();
const TEXTURE_LOADER = new THREE.TextureLoader();
const FILE_LOADER = new THREE.FileLoader();
const SPEED = 0.01;
const STARTING_POSITION = [-896.42, -359, 116]
const RED_BUILDINGS_LAYER = 1
const BUILDING_COST_LAYER = 2
const ALL_BUILDINGS_LAYER = 3
const DEFAULT_DELAY = 5000
const MAX_POINTS = 1000
const STAR_HEIGHT = 2

let path_details = undefined
let path_vectors = undefined
let path_geometries = undefined

let star_group = new THREE.Group()

app = Q3D.application;
app.scene.autoUpdate = true;


function around(val1, val2, eps = 0.05) {
  val1 = typeof val1 === "number" ? val1 : val1.length();
  return Math.abs(val1 - val2) < eps;
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
    this.customExec = customExec ? customExec.bind(this) : null
    this.customCheck = customCheck ? customCheck.bind(this) : null

    this.cameraVars = ["offset", "theta", "phi"];
    this.counter = 0
  }
  moveCamera() {
    // Only check a value if there is not end timer configured
    if (
      this.end_timer === null &&
      around(app.controls[this.variable], this.until, this.eps)
    ) {
      this.finished_callback();
      return;
    }
    switch (this.variable) {
      case "offset":
        app.controls.dollyIn(this.amt);
        break;
      case "theta":
        app.controls.rotateLeft(this.amt);
        break;
      case "phi":
        app.controls.rotateUp(this.amt);
        break;
      default:
        console.error("Unknown Variable!");
    }
  }
  execute() {
    if (this.customExec) {
      this.customExec()
      if (this.customCheck()) {
        this.finished_callback()
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
      amt: .01,
      until: .94
    }),
    new CinemaEvents({
      name: "activate_danger",
      pre_event: "initial_zoom",
      customExec: () => {quad_group.children[4].visible = true},
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
        quad_group.children[4].visible = false
        quad_group.children[3].visible = true
      },
      customCheck: () => true,
      start_offset: DEFAULT_DELAY
    }),
    new CinemaEvents({
      name: "zoom_out_2",
      variable: "offset",
      amt: .98,
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
      start_offset: DEFAULT_DELAY,
    }),
    new CinemaEvents({
      name: "second_tilt",
      variable: "phi",
      amt: 0.01,
      until: 0.55,
      pre_event: "activate_db",
      start_offset: DEFAULT_DELAY,
    }),
    new CinemaEvents({
      name: "show_red_buidlings",
      pre_event: "zoom_out_2",
      customExec: () => {
        app.project.layers[RED_BUILDINGS_LAYER].setOpacity(1)
        app.project.layers[ALL_BUILDINGS_LAYER].setOpacity(0)
      },
      customCheck: () => true,
      start_offset: DEFAULT_DELAY,
    }),
    new CinemaEvents({
      name: "show_building_cost",
      pre_event: "show_red_buidlings",
      customExec: () => {
        app.project.layers[BUILDING_COST_LAYER].setOpacity(1)
      },
      customCheck: () => true,
      start_offset: DEFAULT_DELAY,
    }),
    new CinemaEvents({
      name: "show_goals",
      pre_event: "show_building_cost",
      customExec: () => {
        star_group.visible = true
      },
      customCheck: () => true,
      start_offset: DEFAULT_DELAY,
    }),
    new CinemaEvents({
      name: "draw_paths",
      pre_event: "show_goals",
      customExec: function() {
        this.counter = this.counter + 2
        path_geometries.forEach((line) => {
          line.geometry.setDrawRange(0,this.counter)
        })
      },
      customCheck: function () { return this.counter > MAX_POINTS -5},
      start_offset: DEFAULT_DELAY,
    }),
  ]
};

// Modify DAT GUI to allow scripting the camera control
addCinemaGUI();
// Load the quadrotor and box model
load_models();

/**
 * Returns a promise for THREE.js model and texture loaders
 *
 * @param {string} filename
 * @param {string} [obj='obj'] Whether to use object or texture loader
 * @returns
 */
function promise_object_loader(filename, obj = 'obj') {
  let loader = obj === 'obj' ? OBJ_LOADER : obj === 'texture' ? TEXTURE_LOADER : FILE_LOADER;
  return new Promise(
    (res, rej) => {
      loader.load(filename, obj => {
        res(obj);
      },
      progress => {},
      err => {
        console.log(err);
      });
    })

}

function load_models() {
  let loaded_quad = promise_object_loader("models/uas.json");
  let loaded_box = promise_object_loader("models/box.json");
  let loaded_texture = promise_object_loader("models/amazon_box.jpg", 'texture');
  let loaded_db = promise_object_loader("models/db.json");
  let loaded_danger = promise_object_loader("models/danger.json");
  let promise_star = promise_object_loader("models/star.json");
  let promise_paths = promise_object_loader("models/paths.json", 'file')

  Promise.all([
    loaded_quad,
    loaded_box,
    loaded_texture,
    loaded_db,
    loaded_danger,
    promise_star,
    promise_paths
  ]).then(([quad, box, box_texture, db, danger, star, path_resp]) => {

    // update box material to amazon prime picture
    box.material = new THREE.MeshPhongMaterial({
      map: box_texture,
      side: THREE.DoubleSide
    });
    box.position.set(0, 0, -0.4);

    // create connecting line between box and drone

    let line = createLine([box.position, quad.position])

    // Create the DB Mesh, set invisible initially
    db.position.set(0, 0, 0.2);
    db.visible = false;

    // Create the danger sign mesh
    danger.position.set(0, 0, 0.5);
    danger.visible = false
    // danger.translateX(-1)

    // Create the Quadrotor Group: quad, box, and line
    quad_group = new THREE.Group();
    // quad_group.position.set(-938, -510, 117.8);
    quad_group.position.set.apply(quad_group.position,STARTING_POSITION)
    quad_group.add(quad, box, line, db, danger);
    // add to scene
    app.scene.add(quad_group);
    // make the controls focus on the quad group
    app.camera.position.set(-2000, -2000, 800);
    app.controls.target = quad_group.position;

    // Get the paths to display
    path_details = JSON.parse(path_resp).features
    path_vectors = path_details.map((feature) => {
      let vec_array = []
      feature.geometry.coordinates.forEach((coord) => {
        let map_coord = proj4(app.project.proj).forward(coord)
        let three_c = app.project.toThreeJSCoordinates.apply(app.project, map_coord)
        vec_array.push(new THREE.Vector3(three_c.x, three_c.y, three_c.z))
      })
      return vec_array
      // proj4(app.project.proj)
    })
    addPathsToScene(path_vectors, 0)
    addStars(path_vectors, star)
    star_group.visible = false
    // Dirty the controller so that theta, phi, and offset states are updated and set.
    // Timeout necessary because you cant set the more than one state at a time!
    app.controls.rotateLeft(0.001);
    setTimeout(() => app.controls.dollyIn(1.1), 500);

    // Set the initial Layers opacity
    app.project.layers[RED_BUILDINGS_LAYER].setOpacity(0)
    app.project.layers[BUILDING_COST_LAYER].setOpacity(0)


    // Everything is now setup to run our animate function.
    window.userAnimateFunction = animateFunction;
  });
}

function addStars(path_vectors, star_template) {
  let star_group_template = new THREE.Group()
  star_group_template.add(star_template)
  path_vectors.forEach((path) => {
    let end_vec = path[path.length -1]
    let clone_star = star_group_template.clone()
    clone_star.position.set(end_vec.x, end_vec.y, end_vec.z + STAR_HEIGHT)
    star_group.add(clone_star)
  })
  app.scene.add(star_group)
}

function addPathsToScene(path_vectors, percent=1) {
  path_geometries = path_vectors.map((vectors) => createBufferLineGeometry(vectors))
  path_geometries.forEach((line) => {
    line.geometry.setDrawRange(0,Math.min(MAX_POINTS - 1, percent * MAX_POINTS))
    line.geometry.attributes.position.needsUpdate = true
    app.scene.add(line)
  })

}

function createLine(vertices, lineWidth=.02, color=0x000000) {
  let lineGeom = new THREE.Geometry()
  vertices.forEach((vertex) => lineGeom.vertices.push({...vertex}))

  let line = new MeshLine()
  line.setGeometry(lineGeom)
  let color_ = new THREE.Color( color );
  let material = new MeshLineMaterial({color: color_, lineWidth});
  let mesh = new THREE.Mesh( line.geometry, material ); // this syntax could definitely be improved!
  return mesh


}

function interpolateLine(line_geom, vectors, total_size=1000) {
  // This contains the actual geometry array buffer!
  const positions = line_geom.geometry.attributes.position.array;
  // How many points pairs of vectors
  let interp_calls = vectors.length - 1
  let points_per_interp_call = Math.floor(total_size / interp_calls)
  let n = 0
  for (let index = 0; index < vectors.length - 1; index++) {
    const vectorFrom = vectors[index];
    const vectorTo = vectors[index + 1];
    for (let index = 0; index < points_per_interp_call; index++) {
      let newVec = new THREE.Vector3()
      newVec = newVec.lerpVectors(vectorFrom, vectorTo, index / points_per_interp_call)
      positions[n++] = newVec.x 
      positions[n++] = newVec.y
      positions[n++] = newVec.z
    }
  }

}

function createBufferLineGeometry(vectors, color = 0x0000FF, linewidth=2) {
  const init_draw_count = 2
  	// geometry
	var geometry = new THREE.BufferGeometry();

	// attributes
	var positions = new Float32Array( MAX_POINTS * 3 ); // 3 vertices per point
  geometry.addAttribute( 'position', new THREE.BufferAttribute( positions, 3 ) );
  
  geometry.setDrawRange( 0, init_draw_count );
	// material
  var material = new THREE.LineBasicMaterial( { color, linewidth} );
  
  // Create the actual mesh
  const line = new THREE.Line( geometry,  material );
  // Fill in the actual points for the line
  interpolateLine(line, vectors, MAX_POINTS)

  line.geometry.attributes.position.needsUpdate = true; // required after the first render
  return line
}


function setObjectVisibility(item, visible=true) {
  item.traverse((node) => {
    node.visible = visible
  })
}

function setObjectRotation(item) {
  var axis = new THREE.Vector3( 0, 1, 0 ).normalize();
  item.traverse((node) => {
    if (node.type === "Mesh") {
      node.rotateOnAxis(axis, SPEED*2)
    }
    // node.rotation.y += SPEED * 2
  })
}

// Add command to DAT GUI for scripting the control of the camera
function addCinemaGUI() {
  let scope = Q3D.gui;
  var folder = scope.gui.addFolder("Cinema");
  scope.parameters.cinema = {};
  scope.parameters.active_cinema = false;
  scope.parameters.cinema.cinema_timings = cinema_timings;

  folder.add(scope.parameters, "active_cinema").name("Active");
  // folder.add(scope.parameters.cmd, 'wf').name('Wireframe Mode').onChange(Q3D.application.setWireframeMode);
}

function animateFunction() {
  if (!Q3D.gui.parameters.active_cinema) return;

  // animate triangle always....
  quad_group.children[4].rotation.y += SPEED * 2;
  setObjectRotation(star_group)

  // Check if initial event "start" is finished.
  let timings = cinema_timings;

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
  // app.controls.dollyIn(1.1);
}

