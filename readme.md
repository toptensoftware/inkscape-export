# inkscape-export

Simple command line utilty for exporting multiple .png images, multiple resolutions from inkscape .svg files

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

## Running the export

To export the images, run the inkscape-export specifying the name of the svg file(s), and the scale factors to export at.  

eg: export all images with as `object-title.png` and `object-title@2x.png`.

~~~
$ inkscape-export my-sprites.svg --scale:1 --scale:2
~~~

You can also specify an output directory for the exported images with the `--out` switch.

eg: to output to a `build` sub-directory.

~~~
$ inkscape-export my-sprites.svg --scale:1 --scale:2 --out:./build
~~~

Use `inkscape-export --help` for more.
