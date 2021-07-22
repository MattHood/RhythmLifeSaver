\version "2.20.0"
\include "template.ly"

\score {
    
    \new RhythmicStaff {
      \relative c' {
                \time 4/4
                <<
                    \new Voice = "rhythm" {
                         r4 r r r |          
                         c2     c16 c c c   c16 c c8 |
                         c4      c8 c   r8 c16 c   c16 c c c
                    }

                    % \new Voice = "counting" {
                    %      \hide NoteHead
                    %      \hide Stem

                    %     c4 c c c | \noBreak 
                    %      c4 c4 c16 c c c c16 c c8 | \noBreak
                    %      c4      c8 c   c8 c16 c   c16 c c c |

                        % r4-"1" r-"2" r-"3" r-"4" | \noBreak  
                        %  c4-"1" c4-"2" c16-"3" c-"e" c-"+" c-"a" c16-"4" c-"e" c8-"+" | \noBreak
                        %  c4-"1"      c8-"2" c-"+"   c8-"3" c16-"+" c-"a"   c16-"4" c-"e" c-"+" c-"a" |
                    % }
                    % \new Lyrics \lyricsto "counting" {
                    %   "1" "2" "3" "4"
                    %   "1" "2" "3" "e" "+" "a" "4" "e" "+" 
                    %   "1" "2" "+"   "3" "+" "a"   "4" "e" "+" "a" 
                    % }

                    \new Lyrics \lyricmode {
                      "1"4 "2"4 "3"4 "4"4
                      "1"4 \PH "2"4 "3"16 "e" "+" "a" "4"16 "e" "+"8 
                      "1"4 "2"8 "+"  "3"8 "+"16 "a"   "4"16 "e" "+" "a" 
                    }
                >>
                
      } 
      
    }
    
    
}
