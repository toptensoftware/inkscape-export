#!/usr/bin/env node
var fs = require('fs');
var os = require('os');
var path = require('path');
var parser = require('fast-xml-parser');
var child_process = require('child_process');

var verbose = false;

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

// Help to build a map of object title to object id
function build_object_map(o, map)
{
    if (typeof(o) != 'object')
        return;
    if (o.title)
    {
        map[o.title["#text"]] = o.attr['@_id'];
    }

    if (Array.isArray(o))
    {
        for (var i=0; i<o.length; i++)
        {
            build_object_map(o[i], map);
        }
    }
    else
    {
        for (var k of Object.keys(o))
        {
            build_object_map(o[k], map);
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

    // XML parser options
    var xml_options = {
        attributeNamePrefix : "@_",
        attrNodeName: "attr", //default is 'false'
        textNodeName : "#text",
        ignoreAttributes : false,
        ignoreNameSpace : false,
        allowBooleanAttributes : false,
        parseNodeValue : true,
        parseAttributeValue : false,
        trimValues: true,
        cdataTagName: "__cdata", //default is 'false'
        cdataPositionChar: "\\c",
        parseTrueNumberOnly: false,
        arrayMode: false, //"strict"
        attrValueProcessor: (val, attrName) => val,
        tagValueProcessor : (val, tagName) => val,
        stopNodes: ["parse-me-as-string"]
    };

    for (var svgfile of options.files)
    {
        console.log(`Processing ${svgfile}`);

        // Load a parse the file
        var xmlData = fs.readFileSync(svgfile, "utf8");
        var svg = parser.convertToJson(parser.getTraversalObj(xmlData,xml_options),xml_options);

        // Build the title to object id map
        var map = {};
        build_object_map(svg, map);

        // Make sure the output directory exists
        mkdirp(options.outdir);

        // Exec options - redirect to null to keep quiet
        var exec_opts = {
            stdio: [null,null,null],
        }

        // Log how many objects found
        var keys = Object.keys(map)
        console.log(`  Found ${keys.length} objects to export.`)

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
        for (var k of keys)
        {
            console.log(`  Exporting ${k}`)
            for (var scale of options.scales)
            {
                var suffix = scale == 1 ? "" : `@${scale}x`;
                var outname = `${k}${suffix}.png`;
                actions += `export-id:${map[k]};`;
                actions += `export-filename:${path.join(options.outdir, outname)};`; 
                actions += `export-dpi:${96*scale};`;
                actions += `export-do;`
            }

            if (actions.length > 32000)
                exec_pending_actions();
        }

        // Find batch of actions
        exec_pending_actions();
        console.log("Finished!");
    }
}


function showVersion()
{
    let pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json')), "utf8");

    console.log(`svg-export ${pkg.version} - Inkscape Export Utility`);
    console.log("Copyright (C) 2020 Topten Software.All Rights Reserved");
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
    console.log("   --scale:N         Adds a scale to export");
    console.log("   --outdir:<dir>    Sets an output directory");
    console.log("   --inkscape:<dir>  Specifies the location of the inkscape executable");
    console.log("   --verbose         Shows Inkscape command line");
    console.log("   --help            Shows this help");
    console.log("   --version         Shows version info");
}

var options = {
    files: [],
    scales: [],
    outdir: "."
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

            case "verbose":
                verbose = true;
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