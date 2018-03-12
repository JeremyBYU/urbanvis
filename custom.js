loader = new THREE.ObjectLoader()
app = Q3D.application
app.scene.autoUpdate = true;

function promise_object_loader(filename) {
  return new Promise((res, rej) => {
    loader.load(filename, (obj) => {
      res(obj)
      });
  })
}


loaded_quad = promise_object_loader('model.json')
loaded_box = promise_object_loader('box.json')

Promise.all([loaded_quad, loaded_box]).then(([quad, box]) => {
  window.quad = quad;
  // quad.rotation.x = Math.PI / 2;
  // Y and Z are flipped now
  quad.translateY(0)
  app.scene.add(quad);
  console.log(quad);
  app.controls.target = quad.position

})


// <script src="./custom.js"></script>
// app.camera = new THREE.PerspectiveCamera(45, app.width / app.height, 0.1, 5000);
// app.controls.target = quad.position
// "height" + max(0, "height" - 6)^1.2

