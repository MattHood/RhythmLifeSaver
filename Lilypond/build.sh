rm -f *.notes
rm -f ../public/*.notes
lilypond *.ly

mv -f *.svg ../public
mv -f *.notes ../public