rm -f *.notes
lilypond *.ly

mv -f *.svg ../public
mv -f *.notes ../public