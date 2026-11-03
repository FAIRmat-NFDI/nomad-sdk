"""Workflow archive data model: sections, tasks and the serialisable archive.

Ported verbatim from ``nomad_utility_workflows.utils.workflows`` (v0.3.x).
Behavioural changes are limited to removing import-time global side effects
(``logging.basicConfig`` and process-wide PyYAML representers).
"""

import logging
from collections import OrderedDict
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, computed_field
from typing_extensions import TypedDict

from nomad_sdk.workflow._yaml import SingleQuotedScalarString, dump_yaml

logger = logging.getLogger(__name__)

TASK_M_DEF = 'nomad.datamodel.metainfo.workflow.TaskReference'
WORKFLOW_M_DEF = 'nomad.datamodel.metainfo.workflow.TaskReference'
# TODO not yet sure about the specification of actual tasks, need to test

SectionType = Literal['task', 'workflow', 'input', 'output']
EntryType = Literal['simulation']


class PathInfo(TypedDict, total=False):
    upload_id: str
    entry_id: str
    mainfile_path: str
    supersection_path: str
    supersection_index: int
    section_type: str
    section_index: int
    archive_path: str


default_path_info = {
    'upload_id': None,
    'entry_id': None,
    'mainfile_path': '',
    'supersection_path': '',
    'supersection_index': None,
    'section_type': None,
    'section_index': -1,
    'archive_path': '',
}


class NomadSection(BaseModel):
    name: Optional[str] = Field(None, description='Name of the section')
    type: Optional[SectionType] = Field(None, description='Type of the section')
    entry_type: Optional[EntryType] = Field(None, description='Type of the entry')
    path_info: dict[str, Any] = Field(
        default=default_path_info.copy(), description='Archive path'
    )
    inputs: list[dict[str, Any]] = Field(
        [{}],
        description='section inputs',
    )
    outputs: list[dict[str, Any]] = Field([{}], description='section outputs')

    def __init__(self, **data):
        super().__init__(**data)
        self.path_info = {**default_path_info, **self.path_info}

    @property
    def archive_path(self) -> str:
        if not self.path_info:
            logger.warning(
                f'No path info provided for {self.type}-{self.name}.'
                ' Section reference will be missing.'
            )
            return ''

        if self.path_info.get('archive_path'):
            return self.path_info['archive_path']
        elif self.type == 'workflow' or self.entry_type == 'simulation':
            return 'workflow2'
        elif self.type == 'task':
            return 'data'
        else:
            return self._get_supersection_path()

    def _get_supersection_path(self) -> str:
        archive_path = ''
        if self.path_info.get('supersection_path'):
            archive_path = self._get_supersection_path_with_index()
        elif self.path_info.get('section_type'):
            archive_path = self._get_supersection_path_from_section_type()
        else:
            logger.warning(
                (
                    'No supersection path or section type provided for '
                    f'{self.type}-{self.name}. Section reference may be incorrect.'
                ),
            )
        return self._get_section_path(archive_path)

    def _get_supersection_path_with_index(self) -> str:
        archive_path = self.path_info['supersection_path']
        if self.path_info.get('supersection_index') is not None:
            archive_path += f'/{self.path_info.get("supersection_index")}'
        return archive_path

    def _get_supersection_path_from_section_type(self) -> str:
        archive_path = ''
        if self.path_info.get('section_type') in ['system', 'calculation', 'method']:
            # get default run supersection for simulation sections
            run_index = self.path_info.get('supersection_index', 0)
            run_index = run_index if run_index is not None else 0
            archive_path = f'run/{run_index}'
        elif self.path_info.get('section_type') in ['results']:
            archive_path = 'workflow2'
        # ? Is this required in some case?
        # ! It appears to be a duplicate of get_section_path
        # else:
        #     archive_path += f"/{self.path_info.get('section_type')}"
        #     if self.path_info.get('section_index') is not None:
        #         archive_path += f"/{self.path_info.get('section_index')}"
        return archive_path

    def _get_section_path(self, archive_path: str) -> str:
        if self.path_info.get('section_type') is not None:
            archive_path += f'/{self.path_info["section_type"]}'
            if self.path_info.get('section_index') is not None:
                archive_path += f'/{self.path_info["section_index"]}'
        else:
            # TODO: this may be is a false warning if the subsection_path is given
            logger.warning(
                (
                    f'No section type provided for {self.type}-{self.name}. '
                    'Section reference may be incorrect.'
                ),
            )
        return archive_path

    @property
    def upload_prefix(self) -> str:
        if not self.path_info['mainfile_path']:
            logger.warning(
                f'No mainfile path provided for {self.type}-{self.name}. '
                'Section reference will be missing.'
            )
            return ''

        if self.path_info.get('entry_id') and self.path_info.get('upload_id'):
            upload_prefix = (
                f'../uploads/{self.path_info.get("upload_id")}/archive/'
                f'{self.path_info.get("entry_id")}'
            )
        elif self.path_info.get('entry_id'):
            # TODO - remove when entry_id only references supported
            logger.warning(
                'upload_id missing. entry_id only references not yet supported.'
                'reference will be missing.'
            )
            upload_prefix = f'../entries/{self.path_info.get("entry_id")}/archive'
        elif self.path_info.get('upload_id'):
            # TODO - remove when upload_id only references supported
            logger.warning(
                'entry_id missing. upload_id only references not yet supported.'
                'reference will be missing.'
            )
            upload_prefix = (
                f'../uploads/{self.path_info.get("upload_id")}/archive/mainfile/'
                f'{self.path_info["mainfile_path"]}'
            )
        else:
            upload_prefix = (
                f'../upload/archive/mainfile/{self.path_info["mainfile_path"]}'
            )

        return upload_prefix

    @property
    def full_path(self) -> str:
        if not self.upload_prefix or not self.archive_path:
            return ''

        return f'{self.upload_prefix}#/{self.archive_path}{""}'

    def to_dict(self) -> dict:
        return OrderedDict(
            {'name': self.name, 'section': SingleQuotedScalarString(self.full_path)}
        )


class NomadTask(BaseModel):
    name: str
    inputs: list[NomadSection] = Field(default_factory=list)
    outputs: list[NomadSection] = Field(default_factory=list)
    task_section: Optional[NomadSection] = None

    def __init__(self, **data):
        super().__init__(**data)
        for i, input_ in enumerate(self.inputs):
            if input_.name is None:
                input_.name = f'input_{i}'
        for o, output_ in enumerate(self.outputs):
            if output_.name is None:
                output_.name = f'output_{o}'

    @computed_field
    @property
    def m_def(self) -> str:
        if self.task_section.type == 'workflow':
            return WORKFLOW_M_DEF
        elif self.task_section.type == 'task':
            return TASK_M_DEF

    @computed_field
    @property
    def task(self) -> Optional[str]:
        if self.task_section.type == 'workflow' and self.task_section.upload_prefix:
            return self.task_section.upload_prefix + '#/workflow2'
        elif self.task_section.type == 'task' and self.task_section.full_path:
            return self.task_section.full_path
        else:
            return None

    def to_dict(self) -> dict:
        output_dict = OrderedDict()
        if self.m_def:
            output_dict['m_def'] = self.m_def
        output_dict['name'] = self.name
        if self.task:
            output_dict['task'] = self.task
        output_dict['inputs'] = [i.to_dict() for i in self.inputs]
        output_dict['outputs'] = [o.to_dict() for o in self.outputs]

        return output_dict


class NomadWorkflowArchive(BaseModel):
    archive_section: Optional[str] = None
    m_def: Optional[str] = None
    name: Optional[str] = None
    inputs: list[NomadSection] = Field(default_factory=list)
    outputs: list[NomadSection] = Field(default_factory=list)
    tasks: list[NomadTask] = Field(default_factory=list)

    def remove_duplicate_ios(self) -> None:
        def remove_duplicates(ios):
            seen = set()
            trimmed = []
            for io in ios:
                if io.full_path not in seen:
                    trimmed.append(io)
                    seen.add(io.full_path)
            return trimmed

        self.inputs = remove_duplicates(self.inputs)
        self.outputs = remove_duplicates(self.outputs)

    def to_dict(self) -> dict:
        yaml_dict = {self.archive_section: OrderedDict({})}
        if self.m_def:
            yaml_dict[self.archive_section]['m_def'] = self.m_def
        if self.name:
            yaml_dict[self.archive_section]['name'] = self.name
        if self.inputs:
            yaml_dict[self.archive_section]['inputs'] = [
                i.to_dict() for i in self.inputs
            ]
        if self.outputs:
            yaml_dict[self.archive_section]['outputs'] = [
                o.to_dict() for o in self.outputs
            ]
        if self.tasks:
            yaml_dict[self.archive_section]['tasks'] = [t.to_dict() for t in self.tasks]

        return yaml_dict

    def to_yaml(self, destination_filename: str) -> None:
        with open(destination_filename, 'w') as f:
            dump_yaml(
                self.to_dict(),
                f,
                default_flow_style=False,
                allow_unicode=True,
                width=80,
            )
