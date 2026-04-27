"""Domain exceptions for Notes module."""

class FileTooLargeError(Exception):
    pass

class UnsupportedFileTypeError(Exception):
    pass

class InvalidRatingError(Exception):
    pass

class NoteNotFoundError(Exception):
    pass

class NotNoteOwnerError(Exception):
    pass

class CannotReviewOwnNoteError(Exception):
    pass

class AlreadyReviewedError(Exception):
    pass
