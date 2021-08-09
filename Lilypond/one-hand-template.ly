\version "2.20.0"
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%%% 1. Add title
%%% Title must be the same as the filename, without '.ly'. E.g., 'song.ly' & 'title = #"song"'
title = #"one-hand-template"
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%

\include "common.ly"

\score {
    
    \new RhythmicStaff \with { instrumentName = #"AH" } {
     %%%%%%%%%%%%%%%%%%%%%%%
    %%% 2. Time signature
    \time 4/4 
    %%%%%%%%%%%%%%%%%%%%%%%


    <<
    
    \new Voice = "rhythm" {
    \override NoteHead.output-attributes = #'((id . "AH"))
    \override Rest.output-attributes = #'((id . "AH"))
    %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
    %%% 3. Music for any hand  
    %%% Lilypond takes note information in the format 'note''duration'. 
    %%% Since the rhythm staff ignores pitch, we'll just use 'c' for our notes.
    %%% Write 'r' for a rest.
    %%% Durations follow the American convention: '1' for semibreve, '4' for crotchet, '16' for quaver, etc.
    %%% Append a '.' for a dotted note. 
    %%%   E.g., a dotted quaver would be written 'c8.'
    %%% If you don't specify a duration, the last duration you used is assumed. 
    %%%   E.g., a bar of four crotchets could be written as 'c4 c c c'
    %%% Indicate a barline with '|'. Lilypond doesn't actually use this for typesetting, it calculates the barlines itself.
    %%%   It's there to help you keep things organised, 
    %%%   and Lilypond will use it to warn you if you try and put the wrong amount of notes in a bar.
    %%% Likewise, separate lines don't cause a new system - Lilypond handles this. 
    %%%   Newlines can be used to keep things organised.
                    
    r4 r r r |          
    c2     c16 c c c   c16 c c8 |
    c4      c8 c   r8 c16 c   c16 c c c

    %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
    }        

    \new Lyrics \with { instrumentName = "Counts" } \lyricmode  {
    %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
    %%% 4. Counting
    %%% Similar to the notes, but instead of pitches, write the count in double quotes. 
    %%% Durations can be added immediate after.
    %%% E.g., for a '1' count that last for a dotted quaver, write: ' "1"8. '

      "1"4 "2"4 "3"4 "4"4 |
      "1"4 "2"4 "3"16 "e" "+" "a" "4"16 "e" "+"8 |
      "1"4 "2"8 "+"  "3"8 "+"16 "a"   "4"16 "e" "+" "a"  |

    %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
    }
    >>
                

      
    }
    
    
}
