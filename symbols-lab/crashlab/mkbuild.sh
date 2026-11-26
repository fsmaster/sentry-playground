#!/bin/bash
# mkbuild.sh <version> [dirname]  -> C:\lab\builds\<dirname>
set -e
V=$1; D=${2:-$1}
cd /c/lab/crashlab
cmake -B build -DAPP_VERSION=$V > /dev/null
rm -f build/RelWithDebInfo/crashlab.* build/crashlab.public.pdb
cmake --build build --config RelWithDebInfo --target crashlab > /dev/null
O=/c/lab/builds/$D; mkdir -p $O/app $O/symbols
cp build/RelWithDebInfo/crashlab.exe build/external/sentry-native/crashpad_build/handler/RelWithDebInfo/crashpad_handler.exe build/external/sentry-native/crashpad_build/handler/RelWithDebInfo/crashpad_wer.dll $O/app/
cp build/external/sentry-native/RelWithDebInfo/sentry.dll $O/app/ 2>/dev/null || true
cp build/RelWithDebInfo/crashlab.exe build/RelWithDebInfo/crashlab.pdb $O/symbols/
cp build/crashlab.public.pdb $O/symbols/crashlab.public.pdb
echo "$D: $(npx -y @sentry/cli debug-files check $O/symbols/crashlab.pdb | grep 'Debug ID')"
