import pickle

from django import VERSION

django_version = f"{VERSION[0]}.{VERSION[1]}"

from sentry.testutils import TestCase


class Lol(TestCase):
    def setUp(self):
        self.project = self.create_project(name="cool project")

    def test_generate_pickle(self):
        with open(f"project-{django_version}.pickle", "wb") as f:
            f.write(pickle.dumps(self.project))

    def test_21_unpickles_20(self):
        assert django_version == "2.1"
        with open("project-2.0.pickle", "rb") as f:
            project_20 = pickle.loads(f.read())

        assert project_20 == self.project
        assert project_20.name == self.project.name
        assert project_20.slug == self.project.slug
        assert project_20.organization == self.project.organization
        assert project_20.status == self.project.status
        assert project_20.flags == self.project.flags
        assert project_20.platform == self.project.platform

    def test_20_unpickles_21(self):
        assert django_version == "2.0"
        with open("project-2.1.pickle", "rb") as f:
            project_21 = pickle.loads(f.read())

        assert project_21 == self.project
        assert project_21.name == self.project.name
        assert project_21.slug == self.project.slug
        assert project_21.organization == self.project.organization
        assert project_21.status == self.project.status
        assert project_21.flags == self.project.flags
        assert project_21.platform == self.project.platform
