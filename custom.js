obj_loader = new THREE.ObjectLoader()
texture_loader = new THREE.TextureLoader()
app = Q3D.application
app.scene.autoUpdate = true;



function promise_object_loader(filename, obj=true) {
  loader = obj ? obj_loader : texture_loader
  return new Promise((res, rej) => {
    loader.load(filename, (obj) => {
      res(obj)
      });
  }, (progress) => {

  }, (err) => {
    console.log(err)
  })
}

loaded_quad = promise_object_loader('model.json')
loaded_box = promise_object_loader('box.json')
loaded_texture = promise_object_loader('amazon_box.jpg', false)

Promise.all([loaded_quad, loaded_box, loaded_texture]).then(([quad, box, box_texture]) => {
  // update box material to amazon prime picture
  box.material = new THREE.MeshPhongMaterial( { map: box_texture, side: THREE.DoubleSide } )
  box.position.set(0,0,-.4)

  // create connecting line between box and drone
  let material = new THREE.LineBasicMaterial( { color: 0x484848, linewidth:10 } );
  let geometry = new THREE.Geometry();
  geometry.vertices.push(box.position);
  geometry.vertices.push(quad.position );
  let line = new THREE.Line( geometry, material );
  // Create the Quadrotor Group: quad, box, and line
  window.quad_group = new THREE.Group();
  window.quad_group.position.set(-938,-510,117.8)
  quad_group.add(quad, box, line)
  // add to scene
  app.scene.add(quad_group)
  // make the controls focus on the quad group
  app.camera.position.set(-2000, -2000, 800);
  app.controls.target = window.quad_group.position
  app.controls.dollyIn(1.1)
  app.controls.rotateLeft(.001)

})

// new THREE.MeshPhongMaterialMaterial( { map: amazon_texture, side: THREE.DoubleSide } )
// <script src="./custom.js"></script>
// app.camera = new THREE.PerspectiveCamera(45, app.width / app.height, 0.1, 5000);
// app.controls.target = quad.position
// "height" + max(0, "height" - 6)^1.2

