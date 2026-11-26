cmake_minimum_required(VERSION 3.18)
project(crashlab C CXX)

# sentry-native as a subdirectory, crashpad backend: a real minidump on crash
set(SENTRY_BACKEND crashpad CACHE STRING "" FORCE)
set(SENTRY_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(SENTRY_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
add_subdirectory(external/sentry-native)

set(APP_VERSION "dev" CACHE STRING "version baked into the binary")

add_executable(crashlab crashlab.cpp)
target_compile_definitions(crashlab PRIVATE APP_VERSION="${APP_VERSION}")
target_link_libraries(crashlab PRIVATE sentry::sentry)

if(MSVC)
  # optimized build + full PDB, like a real release build.
  # /INCREMENTAL:NO so every link gives a clean exe and a new PDB GUID.
  target_compile_options(crashlab PRIVATE /Zi /O2)
  target_link_options(crashlab PRIVATE /DEBUG:FULL /INCREMENTAL:NO /OPT:REF /OPT:ICF
    /PDBSTRIPPED:${CMAKE_BINARY_DIR}/crashlab.public.pdb)
endif()
