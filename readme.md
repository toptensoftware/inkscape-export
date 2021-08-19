# inkscape-export

Simple command line utilty for exporting multiple .png images, multiple resolutions and multiple 
frames from Inkscape .svg files

## Installation

Install with:

```
sudo npm install -g inkscape-export
```

You'll also need Inkscape installed.  On Windows it's assumed to be at:

~~~
C:\Program Files\Inkscape
~~~

on other platforms `inkscape` should be somewhere on the path, or you can use
the `--inkscape` command line switch to specify where Inkscape is installed.


## Preparing the .SVG File

The only objects that will be exported from the .svg files are those that have a title
string attached - and that title will be used as the base name for the exported .png files.

Make sure that any objects that shouldn't be exported don't have a title string.

Alternatively, instead of using the title string you can give the element an 
`inkscape-export-filename` attribute, which will be used in preference to 
the title if it is also present.

To enforce usage of the `inkscape-export-filename` attribute and ignore the element titles
use the `--no-titles` command line switch.

Filenames can include a directory paths to export to sub-directories of the output folder.


## Running the export

To export the images, run the inkscape-export specifying the name of the svg file(s), and the scale 
factors to export at.  

eg: export all images as `object-title.png` and `object-title@2x.png`.

~~~
$ inkscape-export my-sprites.svg --scale:1 --scale:2
~~~

You can also specify an output directory for the exported images with the `--out` switch.

eg: to output to a `build` sub-directory.

~~~
$ inkscape-export my-sprites.svg --scale:1 --scale:2 --out:./build
~~~


## Transparent Color

Sometimes it's handy to author the SVG file with a colored background behind 
certain elements.  This is especially useful for:

* creating sizing rectangles to enforce the inclusion of whitespace around an element 
* matching the color the eventual rendering target 
* making it easier to identify export regions.

To exclude those elements from the exported images, use Inkscape's XML editor to give
the item the 'inkscape-export-transparent' attribute and set it to 1.

Any items marked as such will be modified modified to have a `fill-opacity:0` style.


## Multi-Frame Exports

Inkscape-export supports a limited form of multi-frame export where the attributes
of elements are adjusted for each frame.  The animations are configured by setting
special attributes on the svg XML elements (typically using Inkscape's XML Editor).

Firstly, set the number of frames for an item by setting the `inkscape-export-frames`
attribute on the same element that has the export filename set (via the item's title 
or with the `inkscape-export-filename` attribute).  This controls how many frames will
be exported for this item.

Next, you need to set how you want the output filename to be formatted using an 
expression like so:

```
    <g
       inkscape-export-frames="64"
       inkscape-export-filename="Knob_${frame}"
       >
```

This will result in filenames `Knob_00.png`, `Knob_01.png` etc...

Next on any child element, use the `inkscape-export-frame` attribute to set attribute
modifications for that element.

For example, to rotate an element from -120 to +120 degrees add an attribute like this:

```
    inkscape-export-frame="transform=rotate(${-120+x*240},12,12)"
```

The variable `x` will vary from 0.0 for the first frame up to 1.0 for the last.  You can
also use the variable `frame` to get the actual frame number.

You can specify multiple attribute modifications in the `inkscape-export-frame` attribute
by separating them with a semicolon.  And, you can include `inkscape-export-frame` attributes
on as many child elements as you like.

Both the filename and frame expressions are evaluated as JavaScript interpolated strings.


## Temporary Files

When using transparent colors or frame animations, the file needs to be
modified and rewritten before being passed to Inkscape.

In these cases, the modified file will be saved as a file with `.patched`
appended to the filename and saved in the same  directory as the original 
svg file (so write permissions are needed).  The temporary file will be 
deleted once the export is finished.


## More information

Use `inkscape-export --help` for more.
