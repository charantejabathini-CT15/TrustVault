from app.core import storage


class FakeBlob:
    def __init__(self):
        self.data = None
        self.content_type = None
        self.deleted = False
        self.signed_requests = []

    def upload_from_string(self, data, content_type):
        self.data = data
        self.content_type = content_type

    def download_as_bytes(self):
        return self.data

    def exists(self):
        return self.data is not None

    def delete(self):
        self.deleted = True
        self.data = None

    def generate_signed_url(self, **kwargs):
        self.signed_requests.append(kwargs)
        return f"https://storage.test/{kwargs['method'].lower()}"


class FakeBucket:
    def __init__(self):
        self.blobs = {}

    def blob(self, storage_key):
        return self.blobs.setdefault(storage_key, FakeBlob())


def test_firebase_storage_upload_download_and_delete(monkeypatch):
    bucket = FakeBucket()
    monkeypatch.setattr(storage.settings, "STORAGE_TYPE", "firebase")
    monkeypatch.setattr(storage, "get_storage_bucket", lambda: bucket)

    storage.upload_file("org/document", b"encrypted-payload", "application/octet-stream")
    assert storage.download_file("org/document") == b"encrypted-payload"

    storage.delete_file("org/document")
    assert bucket.blobs["org/document"].deleted


def test_firebase_storage_signed_urls_are_method_scoped(monkeypatch):
    bucket = FakeBucket()
    monkeypatch.setattr(storage.settings, "STORAGE_TYPE", "firebase")
    monkeypatch.setattr(storage, "get_storage_bucket", lambda: bucket)
    monkeypatch.setattr(storage, "_firebase_signing_identity", lambda: ("service@test", "access-token"))

    upload_url = storage.create_upload_url("org/document", "application/octet-stream")
    download_url = storage.create_download_url("org/document")

    assert upload_url.startswith("https://")
    assert download_url.startswith("https://")
    signed_requests = bucket.blobs["org/document"].signed_requests
    assert [request["method"] for request in signed_requests] == ["PUT", "GET"]
    assert all(request["version"] == "v4" for request in signed_requests)
    assert signed_requests[0]["content_type"] == "application/octet-stream"