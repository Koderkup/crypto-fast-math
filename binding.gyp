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
            "defines": [
                "NAPI_VERSION=8",
                "NAPI_CPP_EXCEPTIONS"
            ],

            # ---- Linux / generic GCC / Clang ----
            "cflags!": ["-fno-exceptions"],
            "cflags_cc!": ["-fno-exceptions", "-fno-rtti"],
            "cflags_cc": ["-fexceptions", "-frtti", "-std=c++17"],

            # ---- macOS ----
            "xcode_settings": {
                "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
                "GCC_ENABLE_CPP_RTTI": "YES",
                "CLANG_CXX_LIBRARY": "libc++",
                "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
                "MACOSX_DEPLOYMENT_TARGET": "10.15"
            },

            # ---- Windows ----
            "msvs_settings": {
                "VCCLCompilerTool": {
                    "ExceptionHandling": 1,
                    "RuntimeTypeInfo": "true",
                    "AdditionalOptions": [
                        "/bigobj",
                        "/utf-8",
                        "/Zc:__cplusplus",
                        "/std:c++17"
                    ]
                }
            },

            "conditions": [
                ["OS==\"win\"", {
                    "defines": ["_HAS_EXCEPTIONS=1"]
                }]
            ]
        }
    ]
}
