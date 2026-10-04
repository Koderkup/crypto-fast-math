{
  "targets": [
    {
      "target_name": "addon",
      "sources": [
        "src/cpp/addon.cpp",
        "src/cpp/indicators.cpp",
        "src/cpp/formula_engine.cpp"
      ],
      "include_dirs": [
        "node_modules/node-addon-api",
        "src/cpp"
      ],
      "cflags!": [ "-fno-exceptions" ],
      "cflags_cc!": [ "-fno-exceptions" ],
      "defines": [
        "NAPI_VERSION=8",
        "NAPI_CPP_EXCEPTIONS"
      ],
      "defines!": [ "_HAS_EXCEPTIONS=0" ],
      "msvs_settings": {
        "VCCLCompilerTool": {
          "ExceptionHandling": 1,
          "RuntimeTypeInfo": "true"
        },
        "cflags_cc!": [ "/GR-", "-fno-rtti", "/EHs-c-", "-fno-exceptions" ],
        "cflags_cc": [ "/GR", "/EHsc", "/bigobj", "/utf-8", "/permitter-", "/Zc:__cplusplus", "/std:c++17" ]
      },
      "conditions": [
        [ "OS==\"win\"", {
          "msvs_settings": {
            "configurations": {
              "Release": {
                "VCCLCompilerTool": {
                  "ExceptionHandling": 1,
                  "RuntimeTypeInfo": "true"
                }
              },
              "Debug": {
                "VCCLCompilerTool": {
                  "ExceptionHandling": 1,
                  "RuntimeTypeInfo": "true"
                }
              }
            }
          }
        }]
      ],
      "xcode": {
        "cflags_cc": [ "-std=c++17", "-stdlib=libc++" ]
      }
    }
  ]
}
