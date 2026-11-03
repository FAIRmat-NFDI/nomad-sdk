"""Workflow specs used by the golden tests.

Extracted from nomad-utility-workflows docs:
* MD_EQUILIBRATION  <- docs/how_to/create_custom_workflows.md (step 1)
* SOLUTE_IN_BILAYER <- docs/examples/workflow_custom_tasks.md
"""
# ruff: noqa


def md_equilibration(NodeAttributes, NodeAttributesUniverse):
    node_attributes = {
        0: NodeAttributes(
            name='input system',
            type='input',
            path_info={
                'mainfile_path': 'Emin/mdrun_Emin.log',
                'section_type': 'system',
            },
            out_edge_nodes=[1],
        ),
        1: NodeAttributes(
            name='Geometry Optimization',
            type='workflow',
            entry_type='simulation',
            path_info={'mainfile_path': 'Emin/mdrun_Emin.log'},
        ),
        2: NodeAttributes(
            name='Equilibration NPT Molecular Dynamics',
            type='workflow',
            entry_type='simulation',
            path_info={'mainfile_path': 'Equil_NPT/mdrun_Equil-NPT.log'},
            in_edge_nodes=[1],
        ),
        3: NodeAttributes(
            name='Production NVT Molecular Dynamics',
            type='workflow',
            entry_type='simulation',
            path_info={'mainfile_path': 'Prod_NVT/mdrun_Prod-NVT.log'},
            in_edge_nodes=[2],
        ),
        4: NodeAttributes(
            name='output system',
            type='output',
            path_info={
                'section_type': 'system',
                'mainfile_path': 'Prod_NVT/mdrun_Prod-NVT.log',
            },
            in_edge_nodes=[3],
        ),
        5: NodeAttributes(
            name='output properties',
            type='output',
            path_info={
                'section_type': 'calculation',
                'mainfile_path': 'Prod_NVT/mdrun_Prod-NVT.log',
            },
            in_edge_nodes=[3],
        ),
    }

    node_attributes_universe = NodeAttributesUniverse(nodes=node_attributes)
    return node_attributes_universe


def solute_in_bilayer(NodeAttributes, NodeAttributesUniverse):
    path_to_job = ''
    node_attributes = {
        0: {
            'name': 'Solute in bilayer workflow parameters',
            'type': 'input',
            'entry_type': 'other',
            'path_info': {
                'archive_path': 'data',
                'mainfile_path': f'{path_to_job}workflow_parameters.archive.yaml',
            },
            'out_edge_nodes': [1, 3],
        },
        1: {
            'name': 'insert_solute_in_box',
            'type': 'task',
            'entry_type': 'other',
            'path_info': {
                'mainfile_path': f'{path_to_job}insert_solute_in_box.archive.yaml',
                'archive_path': 'data',
            },
            'inputs': [
                {
                    'name': 'data from workflow parameters',
                    'path_info': {
                        'archive_path': 'data',
                        'mainfile_path': f'{path_to_job}workflow_parameters.archive.yaml',
                    },
                }
            ],
            'outputs': [
                {
                    'name': 'data from insert_solute_in_box',
                    'path_info': {
                        'archive_path': 'data',
                        'mainfile_path': f'{path_to_job}insert_solute_in_box.archive.yaml',
                    },
                }
            ],
        },
        2: {
            'name': 'convert_box_to_gro',
            'type': 'task',
            'entry_type': 'other',
            'path_info': {
                'mainfile_path': f'{path_to_job}convert_box_to_gro.archive.yaml'
            },
            'in_edge_nodes': [1],
            'inputs': [
                {
                    'name': 'data from insert_solute_in_box',
                    'path_info': {
                        'archive_path': 'data',
                        'mainfile_path': f'{path_to_job}insert_solute_in_box.archive.yaml',
                    },
                }
            ],
            'outputs': [
                {
                    'name': 'data from convert_box_to_gro',
                    'path_info': {
                        'archive_path': 'data',
                        'mainfile_path': f'{path_to_job}convert_box_to_gro.archive.yaml',
                    },
                }
            ],
        },
        3: {
            'name': 'update_topology_file',
            'type': 'task',
            'entry_type': 'other',
            'path_info': {
                'mainfile_path': f'{path_to_job}update_topology_file.archive.yaml'
            },
            'inputs': [
                {
                    'name': 'data from workflow parameters',
                    'path_info': {
                        'archive_path': 'data',
                        'mainfile_path': f'{path_to_job}workflow_parameters.archive.yaml',
                    },
                }
            ],
            'outputs': [
                {
                    'name': 'data from update_topology_file',
                    'path_info': {
                        'archive_path': 'data',
                        'mainfile_path': f'{path_to_job}update_topology_file.archive.yaml',
                    },
                }
            ],
        },
        4: {
            'name': 'minimize',
            'type': 'workflow',
            'entry_type': 'simulation',
            'path_info': {
                'mainfile_path': f'{path_to_job}solute_in_bilayer_minimize.log'
            },
            'in_edge_nodes': [2, 3],
            'inputs': [
                {
                    'name': 'data from convert_box_to_gro',
                    'path_info': {
                        'archive_path': 'data',
                        'mainfile_path': f'{path_to_job}convert_box_to_gro.archive.yaml',
                    },
                },
                {
                    'name': 'data from update_topology_file',
                    'path_info': {
                        'archive_path': 'data',
                        'mainfile_path': f'{path_to_job}update_topology_file.archive.yaml',
                    },
                },
            ],
        },
        5: {
            'name': 'equilibrate',
            'type': 'workflow',
            'entry_type': 'simulation',
            'path_info': {
                'mainfile_path': f'{path_to_job}solute_in_bilayer_equilibrate.log'
            },
            'in_edge_nodes': [4],
        },
        6: {
            'name': 'production',
            'type': 'workflow',
            'entry_type': 'simulation',
            'path_info': {
                'mainfile_path': f'{path_to_job}solute_in_bilayer_production.log'
            },
            'in_edge_nodes': [5],
        },
        7: {
            'name': 'compute_wham',
            'type': 'task',
            'entry_type': 'other',
            'path_info': {'mainfile_path': f'{path_to_job}compute_wham.archive.yaml'},
            'in_edge_nodes': [6],
            'outputs': [
                {
                    'name': 'data from compute_wham',
                    'path_info': {
                        'archive_path': 'data',
                        'mainfile_path': f'{path_to_job}compute_wham.archive.yaml',
                    },
                }
            ],
        },
    }
    # The legacy example uses entry_type='other', which the engine's
    # Literal['simulation'] rejects (doc drift in nomad-utility-workflows). Drop it.
    return NodeAttributesUniverse(
        nodes={
            k: NodeAttributes(**{f: x for f, x in v.items() if f != 'entry_type'})
            for k, v in node_attributes.items()
        }
    )


SPECS = {'md_equilibration': md_equilibration, 'solute_in_bilayer': solute_in_bilayer}
