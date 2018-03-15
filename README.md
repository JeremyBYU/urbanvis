# Urban Vis

This project demonstrates how one can construct a three dimensional world using QGIS that can run in any browser. It also comes with a custom script script that allows you import 3D models and script 'cinematography' scenarios. This script allows one to control the camera and the environment (colors, animation, etc.).  The specific scenario presented is for a UAS failure and the subsequent search for a valid and optimal landing site.

![UAS Landing Site Search](media/recording_fast.gif "UAS Landing Site Search")


This project is built off a plugin for QGIS called [Qgis2threejs](https://github.com/minorua/Qgis2threejs), where ThreeJS is 3D javascript animation library using WebGL. A specific fork of the plugin is used from [here](https://github.com/JeremyBYU/Qgis2threejs/tree/jeremy). This fork allows users to have custom javascript code, increased map resolution, and a more up to date THREEJS version (previous version is 3 years old). Very little was modified and the [documentation](http://qgis2threejs.readthedocs.io/en/docs-release/) for the plugin is still completely valid.

## Setup

1. Install [QGIS2](https://www.qgis.org/en/site/)
2. Install the fork of the plug by downloading it from git and following this [procedure](https://gis.stackexchange.com/questions/26979/how-to-install-a-qgis-plugin-when-offline)

The plugin allows you to **generate** html and js files which are then run on the browser. These files are stored in the `docs` folder and were previously generated. In order to view them you simply 'open' `docs/index.html` file.  Note that if you have Chrome you will have to [disable web security](https://stackoverflow.com/questions/4819060/allow-google-chrome-to-use-xmlhttprequest-to-load-a-url-from-a-local-file) to load local files. Firefox will work just fine, it gives access to local files within the same directory of `index.html` automatically. 

If you just want to *view* this work, not modify, then you dont need to install QGIS or the plugin! Just open the `index.html` file.

## Using QGIS and the Plugin

This repository comes with a QGIS configuration file, `witten.qgs`, such that if you double click it should open up QGIS already configured correctly for the project. In addition the plugin settings are saved as well in `witten.qgis.qto3settings`. I believe these will be loaded up automatically as well.

Data that is used in this model construction are stored in the `data` folder.  The data is explained in the list below:

1. `osm.map.tif` - A raster (image) of open street maps of Witten, Germany
2. `region_witten(.shp,dbf,.prj,qpj,shx)` - A shape file that contains one polygon that is the outline of Witten. Used for constraining the 3D landscape.
3. `witten-buildings.sqlite` - A spatialite database containing buildings in witten germany.  Has information about outlines, roofshape, height, etc.
4. `witten-elevation.tif` - A raster (image) representing the elevation in Witten.

You should see all this data as 'layers' in the bottom left pane in QGIS and should be visible in the map. If you are new to QGIS some [tutorials](https://www.qgistutorials.com/en/) would be helpful

As for using the plugin, please refer to the [documentation](http://qgis2threejs.readthedocs.io/en/docs-release/).

## Cinematography Scripting

Once the plugin has generated the HTML and JS files in the `docs` folder (or if you are just using the ones provided in the repo), you can then begin scripting cinematography visualizations. The plugin will *not* overwrite anything in the `custom` folder where all our custom scripts are placed.

Description of files:

1. `custom/util.js` - General utility javascript functions to interact with environment. Making lines, loading files, holds the `CinemaEvents` class to script events.  You will not necessarily need to touch this.
2. `custom/custom.js` - This where you would put your custom code.  Load models, create objects, and script cinema events.


### Move Camera Forward (Dolly in)

```javascript    
new CinemaEvents({
      name: "initial_zoom", 
      variable: "offset", // name of the camera variable (distance to target)
      amt: 1.02,  // 2% zoom every cycle (Generally 60 Hz)
      until: 3.7, // Distance in meters to camera target
      eps: 1      // Stops at 2.7 - 4.8 meters
    }),
```
### Change Camera Angle

#### Sweep Camera around

```javascript
    new CinemaEvents({
      name: "first_rotate",
      variable: "theta",  // camera angle that sweeps around
      amt: 0.01,  // in radians per cycle
      until: 3.1, // the angle when to stop
      pre_event: "activate_danger",  // dont start event until 'active_danger' is complete
      start_offset: DEFAULT_DELAY    // once activated, delay for a default amount of time
    }),
```
#### Tilt Camera

```javascript
    new CinemaEvents({
      name: "initial_tilt",
      variable: "phi", // camera angle for the tilt
      amt: 0.01,       // rad per cycle
      until: 0.94      // stop when tilting up until it reaches this angle rad
    }),
```
### Custom Scripts

You can define any arbitrary custom script that will be executed every animation cycle (usually 60 HZ). You specify this by providing a `customExec` function and a `customCheck` function.  The check function is performed after every call of `customExec` and if it returns `true` the event will be marked finished. The function is `bound` to the cinema event and has access to all its variables through the `this` keyword. You can see the following `customExec` function taking advantage of the built in counter.

```javascript
    new CinemaEvents({
      name: "show_building_cost",
      pre_event: "show_red_buidlings",
      customExec: function() { // a function
        this.counter += 1;
        app.project.layers[BUILDING_COST_LAYER].setOpacity(this.counter / 100);
      },
      customCheck: function() {
        return this.counter > 100;
      },
      start_offset: DEFAULT_DELAY
    }),
```

# Demo Script

Bellow is the script (in words) actually implemented.

1. We start off with a full view of the city and all the buildings (all same color)
2. We then slowly zoom and tilt the camera into the quad rotor. We see the amazon package as well.
3. We give it a malfunction by providing an exclamation symbol.
4. We do a full 360 sweep around it looking at possible visible landing positions. None found!
5. We remove the exclamation symbol and add the database model. This visualizes an onboard database augmenting the `view` (information) of the UAS.
6. We zoom out and see all available landing sties. Database shows you parks and building rooftops.
7. We then change the colors for invalid roof top landings. Red rooftops symbolize non-flat roofs that are unsuitable for landing.
8. We then show the 'rank', or quantified 'goodness' of the flat roofs. Darker blue means better.
9. We then show green markers (rotating decahedrons) of 4 top chosen landing sites. 
10. We then draw paths to these landing sites representing 3D path planning.

Some example of how to specify these events is shown below in code (JavaScript). These are for events 2-4

```javascript
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

```

