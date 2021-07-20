



%% Generated by lilypond-book.py
%% Options: [exampleindent=10.16\mm,indent=0\mm,line-width=160\mm,quote,ragged-right]
%%\include "lilypond-book-preamble.ly"

\include "my-event-listener.ly"

#(define (add-class grob grob-origin context)
         (let ((name (cdr (assoc 'name
                                (ly:grob-property grob 'meta)))))
            (set! (ly:grob-property grob 'output-attributes) '((class . name)))))

SvgAddClassName =
#(lambda (ctxt)
   (define (add-class-name grob)
    (let* ((attribs (ly:grob-property grob 'output-attributes '()))
           (class (ly:assoc-get 'class attribs '()))
           (name (grob::name grob)))
     (set! class (if (null? class) name (format #f "~a ~a" class name)))
     (set! attribs (assoc-set! attribs 'class class))
     (ly:grob-set-property! grob 'output-attributes attribs)))
   (make-engraver
    (acknowledgers
     ((grob-interface engraver grob source)
      (add-class-name grob)))))



#(ly:set-option 'backend 'svg)
\pointAndClickOff

\paper {
  #(set-default-paper-size "a2landscape")
  indent = 0\mm
  line-width = 1000\mm
  %line-width = 320\mm
  % offset the left padding, also add 1mm as lilypond creates cropped
  % images with a little space on the right
  %line-width = #(- line-width (* mm  3.000000) (* mm 1))
  %line-width = 160\mm - 2.0 * 10.16\mm
  % offset the left padding, also add 1mm as lilypond creates cropped
  % images with a little space on the right
  %line-width = #(- line-width (* mm  3.000000) (* mm 1))
  ragged-right = ##t
}

\layout {
    \context {
      \Score \consists \SvgAddClassName
      \numericTimeSignature
      %\override NoteHead.output-attributes = #'((class . "notehead"))
      %\override StaffSymbol.output-attributes = #'((class . "staff"))
      %\override Clef.output-attributes = #'((class . "clef"))
      %\override TimeSignature.output-attributes = #'((class . "timesignature"))
      proportionalNotationDuration = #(ly:make-moment 1/30)
      \override SpacingSpanner.uniform-stretching = ##t
    }
  }


