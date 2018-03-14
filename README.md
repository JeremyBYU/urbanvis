# Urban Vis

This project demonstrates how one can construct a three dimensional world using QGIS that can run in any browser. It also comes with a custom script script that allows you import 3D models and script 'cinematography' scenarios. This script allows one to control the camera and the environment (colors, animation, etc.).  The specific scenario presented is for a UAS failure and the subsequent search for a valid landing site.

This project is built off a plugin for QGIS called [Qgis2threejs](https://github.com/minorua/Qgis2threejs), where ThreeJS is 3D javascript animation library using WebGL. A specific fork of the plugin is used from [here](https://github.com/JeremyBYU/Qgis2threejs/tree/jeremy). This fork allows user to have custom javascript code, increased map resolution, and a more up to date THREEJS version (previous version is 3 years old). There is also an updated version of the plugin for QGIS 3 (released Feb 2018), but it is not ready yet. Very little was modified and the [documentation](http://qgis2threejs.readthedocs.io/en/docs-release/) for the plugin is still completely valid.

## Setup

1. Install [QGIS2](https://www.qgis.org/en/site/)
2. Install the fork of the plug by downloading it from git and following this [procedure](https://gis.stackexchange.com/questions/26979/how-to-install-a-qgis-plugin-when-offline)

The plugin allows you to **generate** html and js files which are then run on the browser. These files are stored in the `docs` folder and were previously generated. In order to view them you simply 'open' `docs/index.html` file.  Note that if you have Chrome you will have to [disable web security](https://stackoverflow.com/questions/4819060/allow-google-chrome-to-use-xmlhttprequest-to-load-a-url-from-a-local-file) to load local files. Firefox will work just fine, it gives access to local files in within the same directory of `index.html` automatically. 

If you just want to *view* this work, not modify, then you dont need to install QGIS or the plugin!

## Using QGIS and the Plugin

This repository comes with a QGIS configuration file, `witten.qgs`, such that if you double click it should open up QGIS already configured correctly for the project. In addition the plugin settings are saved as well in `witten.qgis.qto3settings`. I believe these will be loaded up automatically as well.

Data that is used in this model construction are stored in the `data` folder.  A listing is explained in the list below:

1. `osm.map.tif` - A raster (image) of open street maps of witten germany
2. `region_witten.shp` - A shape file that contains one polygon that is the outline of witten germany. Used for contstraining the model
3. `witten-buildings.sqlite` - A spatialite databsae containing buildings in witten germany.  Has information about outlines, roofshape, height, etc.
4. `witten-elevation.tif` - A raster (image) representing the elevation in witten germany

You should see all this data as 'layers' in the bottom left and should be visible in the map. If you are new to QGIS some [tutorials](https://www.qgistutorials.com/en/) would be helpful

As for using the plugin, please refer to the [documentation](http://qgis2threejs.readthedocs.io/en/docs-release/).

## Cinematography Scripting

Once the plugin has generated the HTML and JS files in the `docs` folder (or if you are just using the ones provided in the repo), you can then begin scripting cinematography visualizations. 




## Dolly In
## Sweep Around
## Focos on other buildings



# Script (in Words)

* We start off with a full view of the city and all the buildings (all same color)
* We then slowly zoom into the quad rotor. We see the amazon package
* We give it a malfunction by providing an exclamation symbol
* We do a full 360 sweep around it looking at possible visible landing positions
* We remove the exclamation symbol and add the database.  Like an upgrade, or superpowers
* We zoom out and see all available positions, database is shows you the parks and such
* We then show the colors for valid roof top landings
* Draw paths to a select few landing sites (blue)
* Highlight the best Path Green!

