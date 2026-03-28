"""Error types adapted from Airtest's aircv package."""


class BaseError(Exception):
    """Base class for toolkit exceptions."""


class FileNotExistError(BaseError):
    """Raised when an image file does not exist."""


class TemplateInputError(BaseError):
    """Raised when source and search images cannot be matched."""
