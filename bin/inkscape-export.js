#!/usr/bin/env node
var fs = require('fs');
var os = require('os');
var path = require('path');
var xml2json = require('xml2json');
var child_process = require('child_process');
const { equal } = require('assert');

var verbose = false;
var quiet = false;

function mkdirp(targetDir)
{
    const sep = path.sep;
    const initDir = path.isAbsolute(targetDir) ? sep : '';
    targetDir.split(sep).reduce((parentDir, childDir) => {
      const curDir = path.resolve(parentDir, childDir);
      if (!fs.existsSync(curDir)) {
        fs.mkdirSync(curDir);
      }

      return curDir;
    }, initDir);
}

// Processes the svg tree:
// 1. building a list of things to export
// 2. replacing transparent items
function process_tree(o, items, current_frame_item)
{
    if (typeof(o) != 'object')
        return;

    // Is this an export item?
    if ((!options.noTitles && o.title) || o["inkscape-export-filename"])
    {
        // Create item
        var item = {
            id: o.id,
            filename: o["inkscape-export-filename"] || o.title.$t,
        };

        // Multiple frames?
        if (o["inkscape-export-frames"])
        {
            item.frames = parseInt(o["inkscape-export-frames"])
            item.frame_objects = [];
            current_frame_item = item;
        }

        // Add to list
        items.push(item);
    }

    // Build a list of items to be modified for the frame
    if (current_frame_item && o["inkscape-export-frame"])
    {
        current_frame_item.frame_objects.push(o);
    }

    // Update transparent items
    if (o["inkscape-export-transparent"])
    {
        var styleParts = [];
        if (o.style)
        {
            styleParts = o.style.split(';').filter(x => !x.startsWith("fill-opacity:"));
        }
        styleParts.push("fill-opacity:0");
        o.style = styleParts.join(';');
        options.rewriteFile = true;
    }

    if (Array.isArray(o))
    {
        for (var i=0; i<o.length; i++)
        {
            process_tree(o[i], items, current_frame_item);
        }
    }
    else
    {
        for (var k of Object.keys(o))
        {
            process_tree(o[k], items, current_frame_item);
        }
    }
}

function apply_frame_animations(item, frame)
{
    // Work out animation position from 0.0->1.0
    var x = frame / (item.frames - 1);

    // For all frame objects...
    for (var i=0; i<item.frame_objects.length; i++)
    {
        var o = item.frame_objects[i];
        var frameOpList = o["inkscape-export-frame"];
        var frameOps = frameOpList.split(';');

        // For all attribute ops...
        for (var fo of frameOps)
        {
            var equalPos = fo.indexOf('=');
            var attribute = fo.substr(0, equalPos);
            var expression = fo.substr(equalPos + 1);
            var fn = Function('x', 'frame', 'return `'+ expression + '`');
            var value = fn(x, frame);
            o[attribute] = value;
        }
    }
}


function inkscape_export(options)
{
    if (!options.scales || options.scales.length == 0)
        options.scales = [1,2];
    if (!options.inkscape)
    {
        if (os.platform() == "win32")
            options.inkscape = "C:\\Program Files\\Inkscape\\bin\\inkscape";
        else
            options.inkscape = "inkscape";
    }
    if (!options.outdir)
        options.outdir = "./";

    for (var svgfile of options.files)
    {
        if (!quiet)
            console.log(`Processing ${svgfile}`);

        // Load a parse the file
        var xmlData = fs.readFileSync(svgfile, "utf8");
        var svg = JSON.parse(xml2json.toJson(xmlData, {reversible: true}))

        // Clear rewrite flag
        options.rewriteFile = false;

        // Build the list of things to export
        var items = [];
        process_tree(svg, items);

        var tempFileName;

        // Did we make changes?
        if (options.rewriteFile)
        {
            var newSvg = xml2json.toXml(JSON.stringify(svg));
            tempFileName = svgfile + ".patched";
            svgfile = tempFileName;
            fs.writeFileSync(svgfile, newSvg, "utf8");
        }

        // Make sure the output directory exists
        mkdirp(options.outdir);

        // Exec options - redirect to null to keep quiet
        var exec_opts = {
            stdio: [null,null,null],
        }

        // Log how many objects found
        if (!quiet)
            console.log(`  Found ${items.length} objects to export.`)

        // List of pending actions to be executed
        var actions = "";

        // Helper to execute the pending commands
        function exec_pending_actions()
        {
            // Quit if nothing
            if (actions.length == 0)
                return;

            // Setup inkscape args
            args = [
                svgfile,
                `--actions=${actions}`
            ];

            if (!quiet)
                console.log("  Invoking Inkscape...");

            if (verbose)
                console.log(args);

            // Run
            var r = child_process.spawnSync(options.inkscape, args, exec_opts);
            if (r.status != 0)
            {
                console.log(r.stdout.toString("utf8"));
                console.log("Exported failed");
                process.exit(7);
            }

            actions = "";
        }

        // Build a list of actions to do the export, occassionally flushing
        // to avoid exceeding Windows command line length limit (32k)
        for (var i = 0; i<items.length; i++)
        {
            var item = items[i];

            if (!quiet)
                console.log(`  Exporting ${item.filename}`)

            // Append command line arguments for the request scale amounts
            function queue_scale_actions(frame)
            {
                var filename = item.filename;
                if (frame !== undefined)
                {
                    var frameStr = frame.toString().padStart((item.frames - 1).toString().length, '0');
                    var fn = Function('frame', 'return `'+ item.filename + '`');
                    filename = fn(frameStr);
                }

                for (var scale of options.scales)
                {
                    var suffix = scale == 1 ? "" : `@${scale}x`;
                    var outname = path.join(options.outdir, `${filename}${suffix}.png`);

                    // If name contains a slash or backslash, make sure the directory exists
                    var slashPos = Math.max(outname.lastIndexOf('\\'), outname.lastIndexOf('/'));
                    if (slashPos > 0)
                    {
                        mkdirp(outname.substr(0, slashPos));
                    }


                    actions += `export-id:${item.id};`;
                    actions += `export-filename:${outname};`; 
                    actions += `export-dpi:${96*scale};`;
                    actions += `export-do;`
                }
            }

            // Frame animation on this item?
            if (item.frames && item.frame_objects.length > 0)
            {
                if (!tempFileName)
                {
                    tempFileName = svgfile + ".patched";
                    svgfile = tempFileName;
                }

                // Repeat for all frames
                for (var frame = 0; frame < item.frames; frame++)
                {
                    // Update object tree
                    apply_frame_animations(item, frame);

                    // Re-write the file
                    fs.writeFileSync(tempFileName, xml2json.toXml(JSON.stringify(svg)), "utf8");

                    // Queue actions for this frame
                    queue_scale_actions(frame);

                    // Always exec immediately
                    exec_pending_actions();
                }
            }
            else
            {
                // Simple export, no frames
                queue_scale_actions();

                if (actions.length > 32000)
                    exec_pending_actions();
            }
        }

        // Find batch of actions
        exec_pending_actions();

        // Delete temp file if we created one
        if (tempFileName)
            fs.unlinkSync(tempFileName);

        if (!quiet)
            console.log("Finished!");
    }
}


function showVersion()
{
    let pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json')), "utf8");

    console.log(`svg-export ${pkg.version} - Inkscape Export Utility`);
    console.log("Copyright (C) 2020 Topten Software. All Rights Reserved
`);
}

function showHelp()
{
    showVersion();
    console.log("");
    console.log("Usage: inkscape-export [options] [svgfiles]");
    console.log("");
    console.log("Exports all objects from an SVG file in multiple resolutions.  Only images");
    console.log("that have an assigned title, will be exported and the title is used as the");
    console.log("base name for the exported png file.");
    console.log("");
    console.log("Options:");
    console.log("   --scale:N                Adds a scale to export");
    console.log("   --out:<dir>              Sets an output directory");
    console.log("   --no-titles              Always use `inscape-export-filename` attribute instead of title")
    console.log("   --inkscape:<dir>         Specifies the location of the inkscape executable");
    console.log("   --quiet                  Don't list progress");
    console.log("   --verbose                Shows Inkscape command line");
    console.log("   --help                   Shows this help");
    console.log("   --version                Shows version info");
}

var options = {
    files: [],
    scales: [],
    outdir: ".",
    noTitles: false,
}

// Check command line args
for (var i=2; i<process.argv.length; i++)
{
	var a = process.argv[i];

	var isSwitch = false;
	if (a.startsWith("--"))
	{
		isSwitch = true;
		a = a.substring(2);
	}
	else if (a.startsWith("/"))
	{
		isSwitch = true;
		a = a.substring(1);
	}

	if (isSwitch)
	{
        var parts = a.split(':');
        switch (parts[0])
        {
            case "scale":
                options.scales.push(parseInt(parts[1]));
                break;

            case "out":
                options.outdir = parts[1];
                break;

            case "inkscape":
                options.inkscape = parts[1];
                break;

            case "no-titles":
                options.noTitles = true;
                break;

            case "verbose":
                verbose = true;
                break;

            case "quiet":
                quiet = true;
                break;

            case "help":
                showHelp();
                process.exit(0);

            case "version":
                showVersion();
                process.exit(0);

            default:
                console.error(`Unknown command line arg: ${process.argv[i]}`);
                process.exit(7);
        }
	}
	else
	{
		options.files.push(a);
	}
}

if (options.files.length == 0)
    showHelp();

inkscape_export(options);