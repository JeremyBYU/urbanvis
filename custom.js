// @ts-check
let obj_loader = new THREE.ObjectLoader();
let texture_loader = new THREE.TextureLoader();
const SPEED = 0.01;

function around(val1, val2, eps = 0.05) {
  val1 = typeof val1 === "number" ? val1 : val1.length();
  return Math.abs(val1 - val2) < eps;
}

// Make this global and set to auto update
/**
*  @type {object}
*/
var app, THREE, quad_group

app = Q3D.application;
app.scene.autoUpdate = true;


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
    this.customExec = customExec
    this.customCheck = customCheck

    this.cameraVars = ["offset", "theta", "phi"];
    console.log(this);
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
      start_offset: 5000
    }),
    new CinemaEvents({
      name: "first_rotate",
      variable: "theta",
      amt: 0.01,
      until: 3.1,
      pre_event: "activate_danger",
      start_offset: 5000
    })
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
 * @param {boolean} [obj=true] Whether to use object or texture loader
 * @returns
 */
function promise_object_loader(filename, obj = true) {
  let loader = obj ? obj_loader : texture_loader;
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
  let loaded_texture = promise_object_loader("models/amazon_box.jpg", false);
  let loaded_db = promise_object_loader("models/db.json");
  let loaded_danger = promise_object_loader("models/danger.json");

  Promise.all([
    loaded_quad,
    loaded_box,
    loaded_texture,
    loaded_db,
    loaded_danger
  ]).then(([quad, box, box_texture, db, danger]) => {
    // update box material to amazon prime picture
    box.material = new THREE.MeshPhongMaterial({
      map: box_texture,
      side: THREE.DoubleSide
    });
    box.position.set(0, 0, -0.4);

    // create connecting line between box and drone

    let line = createLine([box.position, quad.position])

    // let material = new THREE.LineBasicMaterial({
    //   color: 0x484848,
    //   linewidth: 10
    // });
    // let geometry = new THREE.Geometry();
    // geometry.vertices.push(box.position);
    // geometry.vertices.push(quad.position);
    // let line = new THREE.Line(geometry, material);

    // Create the DB Mesh, set invisible initially
    db.position.set(0, 0, 0.2);
    db.visible = false;

    // Create the danger sign mesh
    danger.position.set(0, 0, 0.5);
    danger.visible = false
    // danger.translateX(-1)

    // Create the Quadrotor Group: quad, box, and line
    quad_group = new THREE.Group();
    quad_group.position.set(-938, -510, 117.8);
    quad_group.add(quad, box, line, db, danger);
    // add to scene
    app.scene.add(quad_group);
    // make the controls focus on the quad group
    app.camera.position.set(-2000, -2000, 800);
    app.controls.target = window.quad_group.position;
    // Dirty the controller so that theta, phi, and offset states are updated and set.
    // Timeout necessary because you cant set the more than one state at a time!
    app.controls.rotateLeft(0.001);
    setTimeout(() => app.controls.dollyIn(1.1), 500);
    // Everything is now setup to run our animate function
    window.userAnimateFunction = animateFunction;
  });
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

// new THREE.MeshPhongMaterialMaterial( { map: amazon_texture, side: THREE.DoubleSide } )
// <script src="./custom.js"></script>
// app.camera = new THREE.PerspectiveCamera(45, app.width / app.height, 0.1, 5000);
// app.controls.target = quad.position
// "height" + max(0, "height" - 6)^1.2
