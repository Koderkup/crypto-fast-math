
const fs = require('fs');
const vcxf = 'build/addon.vcxproj';
if (!fs.existsSync(vcxf)) { console.error('addon.vcxproj not found — skipping'); process.exit(0); }
let xml = fs.readFileSync(vcxf, 'utf8');

// Enable RTTI for all configurations (Release default is false)
xml = xml.replace(
  /<RuntimeTypeInfo>false<\/RuntimeTypeInfo>/g,
  '<RuntimeTypeInfo>true</RuntimeTypeInfo>'
);

// Enable C++ exceptions for all configurations
xml = xml.replace(
  /<ExceptionHandling>false<\/ExceptionHandling>/g,
  '<ExceptionHandling>Sync</ExceptionHandling>'
);

// Add /bigobj to ClCompile AdditionalOptions (needed for ExprTk single-header)
// Insert /bigobj before %(AdditionalOptions) macro if not already present
if (!xml.includes('/bigobj')) {
  xml = xml.replace(/<AdditionalOptions>/g, '<AdditionalOptions>/bigobj ');
}

// Add /GR to ClCompile AdditionalOptions only
const re = /(<ClCompile>)([\s\S]*?)(<AdditionalOptions>[^<]*%\(AdditionalOptions\)<\/AdditionalOptions>)([\s\S]*?)(<\/ClCompile>)/g;
xml = xml.replace(re, (m, a, b, c, d, e) =>
  c.includes('/GR') ? m : a + b + c.replace('</AdditionalOptions>', ' /GR</AdditionalOptions>') + d + e
);

// Disable incremental linking (avoids LNK1103 debug info corruption)
xml = xml.replace(/<LinkIncremental>true<\/LinkIncremental>/g, '<LinkIncremental>false</LinkIncremental>');
// Disable WholeProgramOptimization / LTCG (avoids LNK1103 in /LTCG mode)
xml = xml.replace(/<WholeProgramOptimization>true<\/WholeProgramOptimization>/g, '<WholeProgramOptimization>false</WholeProgramOptimization>');
// Remove /LTCG and /LTCG:INCREMENTAL from linker AdditionalOptions
xml = xml.replace(/\/LTCG:INCREMENTAL/g, '');
xml = xml.replace(/\/LTCG /g, '');
xml = xml.replace(/\/LTCG<\/AdditionalOptions>/g, '</AdditionalOptions>');
// Remove /LTCG from Lib AdditionalOptions
xml = xml.replace(/\/LTCG %(AdditionalOptions)/g, '%(AdditionalOptions)');

fs.writeFileSync(vcxf, xml);
console.log('Fixed: RTTI=true, ExceptionHandling=Sync, /GR in ClCompile, LinkIncremental=false, LTCG disabled');
